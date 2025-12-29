import { getStore } from "@netlify/blobs";

const store = getStore({ name: "sunwoo-takbae-v1", consistency: "strong" });

export default async function handler(request) {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    if (!key) {
      return new Response(JSON.stringify({ error: "MISSING_KEY" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    const value = await store.get(key, { type: "json" });
    return new Response(JSON.stringify({ key, value: value ?? null }), {
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
