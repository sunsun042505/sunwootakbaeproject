/**
 * netlify/functions/data.js  (API v1.0 unified)
 * - Single source of truth: Netlify Blobs
 * - Reservations upsert + list + byWaybill
 * - KV get/set
 * - No-cache headers to avoid stale /api/reservations
 *
 * Drop this file into: netlify/functions/data.js
 * (If you also have data.mjs, you can copy the same contents there.)
 */

import { getStore } from "@netlify/blobs";

const store = getStore({ name: "sunwoo-takbae-v1", consistency: "strong" });

const RES_KEY = "DELIVERY_RESERVATIONS_V1"; // <- 항상 이 키로 저장/조회

function nowISO() {
  return new Date().toISOString();
}

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

async function readArray(key) {
  const v = await store.get(key, { type: "json" });
  return Array.isArray(v) ? v : [];
}

async function writeArray(key, arr) {
  await store.set(key, arr, { type: "json" });
}

function extractCandidates(rec) {
  const keys = ["waybillNo", "invoiceNo", "invoice_no", "waybill", "wb", "reserveNo"];
  const out = [];
  for (const k of keys) {
    if (rec && rec[k]) out.push(normNo(rec[k]));
  }
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

  if (wb) {
    idx = list.findIndex((x) => extractCandidates(x).includes(wb));
  }
  if (idx === -1 && rn) {
    idx = list.findIndex((x) => String(x?.reserveNo ?? "").trim() === rn);
  }

  const merged = {
    ...(idx >= 0 ? list[idx] : {}),
    ...rec,
    waybillNo: wb || (idx >= 0 ? list[idx]?.waybillNo : rec?.waybillNo) || "",
    reserveNo: rn || (idx >= 0 ? list[idx]?.reserveNo : rec?.reserveNo) || "",
    updatedAt: rec?.updatedAt || nowISO(),
  };

  if (idx >= 0) {
    list[idx] = merged;
  } else {
    list.push(merged);
  }

  return merged;
}

export default async (req, context) => {
  try {
    const url = new URL(req.url);

    // Netlify: /api/* -> /.netlify/functions/data/:splat
    // We normalize to the "splat" path starting with '/'
    let path = url.pathname;

    // Examples:
    // - /.netlify/functions/data/kv/get  -> /kv/get
    // - /api/kv/get                     -> /kv/get
    path = path.replace(/^\/\.netlify\/functions\/data/, "");
    path = path.replace(/^\/api/, "");
    if (!path.startsWith("/")) path = "/" + path;

    const method = req.method.toUpperCase();

    if (method === "OPTIONS") return jsonResponse({ ok: true }, 200);

    // --- health check ---
    if (method === "GET" && (path === "/ping")) {
      return jsonResponse({ ok: true, time: nowISO() }, 200);
    }

    // --- KV ---
    if (method === "GET" && path === "/kv/get") {
      const key = url.searchParams.get("key") || "";
      if (!key) return jsonResponse({ error: "MISSING_KEY" }, 400);
      const value = await store.get(key, { type: "json" });
      return jsonResponse({ key, value: value ?? null }, 200);
    }

    if (method === "POST" && path === "/kv/set") {
      let body = null;
      try { body = await req.json(); } catch { body = null; }
      const key = body?.key;
      const value = body?.value;
      if (!key) return jsonResponse({ error: "MISSING_KEY" }, 400);
      await store.set(key, value, { type: "json" });
      return jsonResponse({ ok: true, key }, 200);
    }

    // --- RESERVATIONS LIST ---
    if (method === "GET" && path === "/reservations") {
      const list = await readArray(RES_KEY);
      return jsonResponse(list, 200);
    }

    // --- RESERVATIONS BY WAYBILL ---
    const mWB = path.match(/^\/reservations\/byWaybill\/(.+)$/);
    if (method === "GET" && mWB) {
      const wb = normNo(decodeURIComponent(mWB[1] || ""));
      const list = await readArray(RES_KEY);
      const rec = findByWaybill(list, wb);
      if (!rec) return jsonResponse({ error: "NOT_FOUND", waybillNo: wb }, 404);
      return jsonResponse(rec, 200);
    }

    // --- UPSERT (compat) ---
    // Accept:
    // - POST /reservations/upsert  { record: {...} } OR just {...}
    // - POST /reservations        (same as upsert)  <-- kiosk 호환용
    if (method === "POST" && (path === "/reservations/upsert" || path === "/reservations")) {
      let body = null;
      try { body = await req.json(); } catch { body = null; }
      const rec = body?.record ?? body;
      if (!rec || typeof rec !== "object") {
        return jsonResponse({ error: "BAD_BODY" }, 400);
      }
      const list = await readArray(RES_KEY);
      const merged = upsertByWaybillOrReserve(list, rec);
      await writeArray(RES_KEY, list);
      return jsonResponse({ ok: true, record: merged, total: list.length }, 200);
    }

    return jsonResponse({
      error: "NO_ROUTE",
      method,
      path,
    }, 404);
  } catch (e) {
    return jsonResponse({ error: "SERVER_ERROR", message: String(e?.message || e) }, 500);
  }
};
