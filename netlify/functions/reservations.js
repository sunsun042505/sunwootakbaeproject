import { getStore } from "@netlify/blobs";

const store = getStore({ name: "sunwoo-takbae-v1", consistency: "strong" });
const RES_KEY = "DELIVERY_RESERVATIONS_V1";

export default async function handler(request) {
  try {
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
        status: 405,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    const url = new URL(request.url);
    const invoice = (url.searchParams.get("invoice_no") || "").replace(/\D/g, "");
    const list = (await store.get(RES_KEY, { type: "json" })) || [];
    const arr = Array.isArray(list) ? list : [];
    if (invoice) {
      const rec = arr.find((x) => String(x?.waybillNo || "").replace(/\D/g, "") === invoice) || null;
      return new Response(JSON.stringify(rec), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    return new Response(JSON.stringify(arr), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "SERVER_ERROR", message: String(err?.message || err) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}
