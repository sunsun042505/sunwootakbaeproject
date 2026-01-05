// netlify/functions/unipass.js
export default async (req) => {
  try {
    const apiKey = process.env.UNIPASS_API_KEY;
    if (!apiKey) {
      return new Response("UNIPASS_API_KEY is missing", { status: 500 });
    }

    const url = new URL(req.url);
    const type = (url.searchParams.get("type") || "hbl").toLowerCase(); // hbl | mbl | carg
    const no = (url.searchParams.get("no") || "").trim();
    const blYy = (url.searchParams.get("blYy") || "").trim();

    if (!no) return new Response("Missing no", { status: 400 });
    if ((type === "hbl" || type === "mbl") && !blYy) {
      return new Response("Missing blYy", { status: 400 });
    }

    const endpoint = new URL(
      "https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo"
    );
    endpoint.searchParams.set("crkyCn", apiKey);

    if (type === "carg") {
      endpoint.searchParams.set("cargMtNo", no);
    } else if (type === "mbl") {
      endpoint.searchParams.set("mblNo", no);
      endpoint.searchParams.set("blYy", blYy);
    } else {
      // default: hbl
      endpoint.searchParams.set("hblNo", no);
      endpoint.searchParams.set("blYy", blYy);
    }

    const r = await fetch(endpoint.toString(), {
      method: "GET",
      headers: { "User-Agent": "sunwoo-takbae/1.0" },
    });

    const text = await r.text();
    return new Response(text, {
      status: r.status,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(String(e?.message || e), { status: 500 });
  }
};
