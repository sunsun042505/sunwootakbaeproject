import { getStore } from "@netlify/blobs";

const store = getStore({ name: "sunwoo-takbae-v1", consistency: "strong" });

function json(data, status=200){
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type",
    }
  });
}

export default async (request, context) => {
  try{
    if(request.method === "OPTIONS") return new Response("", {status:204, headers:{
      "access-control-allow-origin":"*",
      "access-control-allow-methods":"GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers":"content-type"
    }});

    const url = new URL(request.url);
    // Path comes as /api/<splat> via redirect
    let path = url.pathname.replace(/^\/\.netlify\/functions\/api\/?/, "");
    // also allow direct functions call without redirect:
    if(path === url.pathname) path = url.pathname.replace(/^\/api\/?/, "");
    path = path.replace(/^\/+/, ""); // strip leading /

    // ping
    if(path === "ping"){
      return json({ ok:true, ts: Date.now() });
    }

    // KV get
    if(path === "kv/get" && request.method === "GET"){
      const key = url.searchParams.get("key") || "";
      if(!key) return json({ error:"MISSING_KEY" }, 400);
      const val = await store.get(key, { type: "json" });
      return json({ key, value: (val ?? null) });
    }

    // KV set (POST) / delete (DELETE)
    if(path === "kv/set" && (request.method === "POST" || request.method === "DELETE")){
      const body = await request.json().catch(()=> ({}));
      const key = body.key || url.searchParams.get("key") || "";
      if(!key) return json({ error:"MISSING_KEY" }, 400);

      if(request.method === "DELETE"){
        await store.delete(key);
        return json({ ok:true, deleted:key });
      }else{
        const value = ("value" in body) ? body.value : null;
        await store.setJSON(key, value);
        return json({ ok:true, key });
      }
    }

    // Reservations API (used by tracking/label)
    if(path === "reservations" && request.method === "GET"){
      const arr = await store.get("DELIVERY_RESERVATIONS_V1", { type:"json" });
      return json(Array.isArray(arr) ? arr : []);
    }
    if(path === "reservations" && request.method === "POST"){
      const body = await request.json().catch(()=> null);
      const arr = Array.isArray(body) ? body : (body?.data || body?.reservations || []);
      await store.setJSON("DELIVERY_RESERVATIONS_V1", Array.isArray(arr) ? arr : []);
      return json({ ok:true, count: Array.isArray(arr) ? arr.length : 0 });
    }

    return json({ error:"NO_ROUTE", method: request.method, path: "/api/"+path }, 404);

  }catch(e){
    console.error(e);
    return json({ error: e?.message || String(e) }, 500);
  }
};
