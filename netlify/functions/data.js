import { getStore } from "@netlify/blobs";

const j = (status, obj) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

const nowStr = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

function normalizePath(pathname) {
  // supports both:
  //  - /.netlify/functions/data/...
  //  - /api/...
  let path = pathname;

  const baseFn = "/.netlify/functions/data";
  if (path.startsWith(baseFn)) path = path.slice(baseFn.length);

  if (path.startsWith("/api")) path = path.slice("/api".length);

  if (!path.startsWith("/")) path = "/" + path;
  path = path.replace(/\/+$/, "") || "/";
  return path;
}

// ---------- KV helpers (for legacy frontend) ----------
const kvKey = (key) => `kv:${key}`;

async function kvGet(store, key) {
  const s = await store.get(kvKey(key), { consistency: "strong" });
  return s ? JSON.parse(s) : null;
}

async function kvSet(store, key, value) {
  await store.set(kvKey(key), JSON.stringify(value));
}

// ---------- Reservations helpers ----------
async function listReservations(store) {
  const { blobs } = await store.list({ prefix: "res:", consistency: "strong" });
  const out = [];
  for (const b of blobs) {
    const s = await store.get(b.key, { consistency: "strong" });
    if (s) out.push(JSON.parse(s));
  }
  out.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  return out;
}

async function getByReserve(store, reserveNo) {
  const s = await store.get(`res:${reserveNo}`, { consistency: "strong" });
  return s ? JSON.parse(s) : null;
}

async function getByWaybill(store, waybillNo) {
  const reserveNo = await store.get(`wb:${waybillNo}`, { consistency: "strong" });
  if (!reserveNo) return null;
  return getByReserve(store, reserveNo);
}

async function upsertReservation(store, rec) {
  rec.updatedAt = nowStr();
  await store.set(`res:${rec.reserveNo}`, JSON.stringify(rec));
  if (rec.waybillNo) await store.set(`wb:${rec.waybillNo}`, rec.reserveNo);
  return rec;
}

export default async (request) => {
  try {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const path = normalizePath(url.pathname);

    const store = getStore("sunwoo-takbae-v1");

    // ---- KV API (used by patched index/kiosk) ----
    // GET /kv/get?key=...
    if (method === "GET" && path === "/kv/get") {
      const key = url.searchParams.get("key") || "";
      if (!key) return j(400, { error: "key required" });
      const value = await kvGet(store, key);
      return j(200, { key, value });
    }

    // POST /kv/set {key, value}
    if (method === "POST" && path === "/kv/set") {
      const body = await request.json();
      const key = String(body?.key || "");
      if (!key) return j(400, { error: "key required" });
      await kvSet(store, key, body?.value);
      return j(200, { ok: true });
    }

    // ---- Reservations (structured API) ----
    if (method === "GET" && path === "/reservations") {
      return j(200, await listReservations(store));
    }

    if (method === "GET" && path.startsWith("/reservations/byReserve/")) {
      const reserveNo = decodeURIComponent(path.replace("/reservations/byReserve/", ""));
      const rec = await getByReserve(store, reserveNo);
      return rec ? j(200, rec) : j(404, { error: "NOT_FOUND" });
    }

    if (method === "GET" && path.startsWith("/reservations/byWaybill/")) {
      const waybillNo = decodeURIComponent(path.replace("/reservations/byWaybill/", ""));
      const rec = await getByWaybill(store, waybillNo);
      return rec ? j(200, rec) : j(404, { error: "NOT_FOUND" });
    }

    if (method === "POST" && path === "/reservations/upsert") {
      const rec = await request.json();
      if (!rec?.reserveNo) return j(400, { error: "reserveNo required" });
      const saved = await upsertReservation(store, rec);
      return j(200, { ok: true, rec: saved });
    }

    // ---- Admin: wipe all data (DANGEROUS) ----
    // POST /admin/wipe { confirm: "전체삭제" }
    if (method === "POST" && path === "/admin/wipe") {
      const body = await request.json().catch(() => ({}));
      const confirmText = String(body?.confirm || "");
      if (confirmText !== "전체삭제") return j(400, { error: "CONFIRM_TEXT_REQUIRED" });

      // Prefer deleteAll if available (newer Blobs API)
      if (typeof store.deleteAll === "function") {
        const res = await store.deleteAll();
        return j(200, { ok: true, mode: "deleteAll", ...res });
      }

      // Fallback: list+delete known prefixes
      const prefixes = ["kv:", "res:", "wb:", "store:", "courier:"];
      let deleted = 0;
      for (const prefix of prefixes) {
        let cursor = undefined;
        while (true) {
          const listed = await store.list({ prefix, cursor, consistency: "strong" });
          const blobs = listed?.blobs || [];
          for (const b of blobs) {
            await store.delete(b.key);
            deleted += 1;
          }
          cursor = listed?.cursor;
          if (!cursor) break;
        }
      }
      return j(200, { ok: true, mode: "list+delete", deleted });
    }

    // ---- Stores / Couriers (simple) ----
    if (method === "POST" && path === "/stores/register") {
      const body = await request.json();
      const name = String(body?.name || "").trim();
      const code = String(body?.code || "").trim();
      if (!name || !code) return j(400, { error: "name/code required" });

      const exist = await store.get(`store:${code}`, { consistency: "strong" });
      if (exist) return j(409, { error: "DUPLICATE_CODE" });

      await store.set(`store:${code}`, JSON.stringify({ name, code, createdAt: nowStr() }));
      return j(200, { ok: true });
    }

    if (method === "POST" && path === "/stores/login") {
      const body = await request.json();
      const name = String(body?.name || "").trim();
      const code = String(body?.code || "").trim();

      const s = await store.get(`store:${code}`, { consistency: "strong" });
      if (!s) return j(404, { error: "NO_STORE" });
      const obj = JSON.parse(s);
      if (obj.name !== name) return j(404, { error: "NO_STORE" });

      return j(200, { ok: true, store: obj });
    }

    if (method === "POST" && path === "/couriers/register") {
      const body = await request.json();
      const name = String(body?.name || "").trim();
      const phone = String(body?.phone || "").trim();
      const code = String(body?.code || "").trim();
      if (!name || !phone || !code) return j(400, { error: "name/phone/code required" });

      const exist = await store.get(`courier:${code}`, { consistency: "strong" });
      if (exist) return j(409, { error: "DUPLICATE_CODE" });

      await store.set(
        `courier:${code}`,
        JSON.stringify({ name, phone, code, createdAt: nowStr() })
      );
      return j(200, { ok: true });
    }

    if (method === "POST" && path === "/couriers/login") {
      const body = await request.json();
      const code = String(body?.code || "").trim();

      const s = await store.get(`courier:${code}`, { consistency: "strong" });
      if (!s) return j(404, { error: "NO_COURIER" });

      return j(200, { ok: true, courier: JSON.parse(s) });
    }

    return j(404, { error: "NO_ROUTE", method, path });
  } catch (e) {
    return j(500, { error: "SERVER_ERROR", detail: String(e?.message || e) });
  }
};
