/**
 * netlify/functions/data.js (Sunwoo Takbae API)  v1.0.4
 * 목적:
 * - 기기별(localStorage)로 갈라지는 문제를 막기 위해 "서버(Blobs) 단일 저장소"로 강제
 * - /api/reservations 가 []만 나오는 경우(키 변경/과거키 잔존) 자동 마이그레이션
 *
 * 지원 라우트:
 *  GET  /api/ping
 *  GET  /api/kv/get?key=...
 *  POST /api/kv/set   {key,value}
 *  GET  /api/reservations
 *  POST /api/reservations            (upsert)
 *  POST /api/reservations/upsert     (upsert)
 *  GET  /api/reservations/byWaybill/:no
 *  GET  /api/debug/reservations      (현재키/레거시키 개수 확인)
 */

import { getStore } from "@netlify/blobs";

const STORE_NAME = "sunwoo-takbae-v1";            // ⚠️ 이거 바꾸면 데이터 "새로" 생김
const RES_KEY    = "DELIVERY_RESERVATIONS_V1";   // 메인 키(통일)
const LEGACY_KEYS = [
  "DELIVERY_RESERVATIONS_V1", // 같은 이름이라도 포함(안전)
  "DELIVERY_RESERVATIONS",
  "DELIVERY_RESERVATIONS_V0",
  "DELIVERY_RESERVATIONS_V2",
  "DELIVERY_RESERVATIONS_V3",
  "DELIVERY_RESERVATIONS_V4",
  "DELIVERY_RESERVATIONS",
  "RESERVATIONS_V1",
  "RESERVATIONS",
];

const META_KEY_LAST_WRITE = "SUNWOO_LAST_WRITE_V1";

const store = getStore({ name: STORE_NAME, consistency: "strong" });

function nowISO() { return new Date().toISOString(); }

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

function normNo(v) {
  return String(v ?? "").trim().replace(/[^0-9]/g, "");
}

async function getJson(key) {
  const v = await store.get(key, { type: "json" });
  return v ?? null;
}

async function setJson(key, value) {
  await store.set(key, value, { type: "json" });
}

function ensureArray(v) {
  return Array.isArray(v) ? v : [];
}

function extractCandidates(rec) {
  const keys = ["waybillNo", "invoiceNo", "invoice_no", "waybill", "wb", "reserveNo"];
  const out = [];
  for (const k of keys) if (rec && rec[k]) out.push(normNo(rec[k]));
  return out.filter(Boolean);
}

function findByWaybill(list, wbRaw) {
  const wb = normNo(wbRaw);
  if (!wb) return null;
  return list.find((rec) => extractCandidates(rec).includes(wb)) || null;
}

function upsertByWaybillOrReserve(list, rec) {
  const wb = normNo(rec?.waybillNo || rec?.invoiceNo || rec?.invoice_no || rec?.waybill || rec?.wb);
  const rn = String(rec?.reserveNo ?? "").trim();

  let idx = -1;
  if (wb) idx = list.findIndex((x) => extractCandidates(x).includes(wb));
  if (idx === -1 && rn) idx = list.findIndex((x) => String(x?.reserveNo ?? "").trim() === rn);

  const merged = {
    ...(idx >= 0 ? list[idx] : {}),
    ...rec,
    waybillNo: wb || (idx >= 0 ? list[idx]?.waybillNo : rec?.waybillNo) || "",
    reserveNo: rn || (idx >= 0 ? list[idx]?.reserveNo : rec?.reserveNo) || "",
    updatedAt: rec?.updatedAt || nowISO(),
  };

  if (idx >= 0) list[idx] = merged;
  else list.push(merged);
  return merged;
}

/**
 * 핵심: reservations 읽을 때
 * - RES_KEY가 비어있으면(== []) 레거시 키들에서 찾아 합쳐서 자동 복구
 * - 복구하면 RES_KEY에 다시 저장(셀프 힐)
 */
async function readReservationsWithMigration() {
  const main = ensureArray(await getJson(RES_KEY));
  if (main.length > 0) return { list: main, migrated: false, from: RES_KEY };

  // main이 []면 레거시에서 찾아본다
  let merged = [];
  const found = [];
  for (const k of LEGACY_KEYS) {
    const arr = ensureArray(await getJson(k));
    if (arr.length) {
      merged = merged.concat(arr);
      found.push({ key: k, count: arr.length });
    }
  }

  // 중복 제거(waybillNo 우선)
  const uniq = [];
  const seen = new Set();
  for (const rec of merged) {
    const wb = normNo(rec?.waybillNo || rec?.invoiceNo || rec?.invoice_no || rec?.waybill || rec?.wb);
    const rn = String(rec?.reserveNo ?? "").trim();
    const id = wb ? `W:${wb}` : (rn ? `R:${rn}` : "");
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    uniq.push(rec);
  }

  if (uniq.length) {
    await setJson(RES_KEY, uniq);
    await setJson(META_KEY_LAST_WRITE, { at: nowISO(), note: "auto-migrated", found });
    return { list: uniq, migrated: true, from: "legacy", found };
  }
  return { list: [], migrated: false, from: "empty", found: [] };
}

function normalizePath(urlPathname) {
  // Netlify: /.netlify/functions/data/xxx
  // Redirect: /api/xxx -> /.netlify/functions/data/xxx  (toml)
  let path = urlPathname || "/";
  path = path.replace(/^\/\.netlify\/functions\/data/, "");
  path = path.replace(/^\/api/, "");
  if (!path.startsWith("/")) path = "/" + path;
  return path;
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const path = normalizePath(url.pathname);

    if (method === "OPTIONS") return jsonResponse({ ok: true }, 200);

    // ping (디버그용)
    if (method === "GET" && path === "/ping") {
      return jsonResponse({ ok: true, time: nowISO(), store: STORE_NAME }, 200);
    }

    // KV
    if (method === "GET" && path === "/kv/get") {
      const key = url.searchParams.get("key") || "";
      if (!key) return jsonResponse({ error: "MISSING_KEY" }, 400);
      const value = await getJson(key);
      return jsonResponse({ key, value: value ?? null }, 200);
    }

    if (method === "POST" && path === "/kv/set") {
      let body = null;
      try { body = await req.json(); } catch { body = null; }
      const key = body?.key;
      const value = body?.value;
      if (!key) return jsonResponse({ error: "MISSING_KEY" }, 400);
      await setJson(key, value);
      await setJson(META_KEY_LAST_WRITE, { at: nowISO(), note: `kv-set:${key}` });
      return jsonResponse({ ok: true, key }, 200);
    }

    // reservations list
    if (method === "GET" && path === "/reservations") {
      const { list, migrated, from } = await readReservationsWithMigration();
      return jsonResponse(list, 200);
    }

    // debug reservations
    if (method === "GET" && path === "/debug/reservations") {
      const main = ensureArray(await getJson(RES_KEY));
      const legacy = [];
      for (const k of LEGACY_KEYS) {
        const arr = ensureArray(await getJson(k));
        if (arr.length) legacy.push({ key: k, count: arr.length });
      }
      const meta = await getJson(META_KEY_LAST_WRITE);
      return jsonResponse({
        store: STORE_NAME,
        resKey: RES_KEY,
        mainCount: main.length,
        legacy,
        lastWrite: meta ?? null,
        time: nowISO(),
      }, 200);
    }

    // byWaybill
    const mWB = path.match(/^\/reservations\/byWaybill\/(.+)$/);
    if (method === "GET" && mWB) {
      const wb = normNo(decodeURIComponent(mWB[1] || ""));
      const { list } = await readReservationsWithMigration();
      const rec = findByWaybill(list, wb);
      if (!rec) return jsonResponse({ error: "NOT_FOUND", waybillNo: wb }, 404);
      return jsonResponse(rec, 200);
    }

    // upsert
    if (method === "POST" && (path === "/reservations" || path === "/reservations/upsert")) {
      let body = null;
      try { body = await req.json(); } catch { body = null; }
      const rec = body?.record ?? body;
      if (!rec || typeof rec !== "object") return jsonResponse({ error: "BAD_BODY" }, 400);

      const { list } = await readReservationsWithMigration();
      const merged = upsertByWaybillOrReserve(list, rec);

      await setJson(RES_KEY, list);
      await setJson(META_KEY_LAST_WRITE, { at: nowISO(), note: "upsert", waybillNo: merged?.waybillNo || "" });

      return jsonResponse({ ok: true, record: merged, total: list.length }, 200);
    }

    return jsonResponse({ error: "NO_ROUTE", method, path }, 404);
  } catch (e) {
    return jsonResponse({ error: "SERVER_ERROR", message: String(e?.message || e) }, 500);
  }
};
