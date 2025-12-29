import { getStore } from "@netlify/blobs";

const store = getStore({ name: "sunwoo-takbae-v1", consistency: "strong" });

export default async function handler(request) {
  try {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
        status: 405,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "INVALID_JSON" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    const { key, value } = body || {};
    if (!key) {
      return new Response(JSON.stringify({ error: "MISSING_KEY" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    // store JSON value
    await store.set(String(key), value);
    return new Response(JSON.stringify({ ok: true, key }), {
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
