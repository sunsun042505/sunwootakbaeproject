export async function handler(event) {
  try {
    const apiKey = process.env.UNIPASS_API_KEY;
    if (!apiKey) {
      return json(500, { ok: false, error: "Missing UNIPASS_API_KEY (Netlify env var)" });
    }

    const qs = event.queryStringParameters || {};
    const hblNo = (qs.hblNo || "").trim();  // 운송장번호(= HBL No)
    const blYy = (qs.blYy || "").trim();    // 입항일(연도) or BL Year (명세대로)

    if (!hblNo) return json(400, { ok: false, error: "Missing hblNo" });
    if (!blYy) return json(400, { ok: false, error: "Missing blYy" });

    const baseUrl =
      "https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo";

    const url = new URL(baseUrl);
    url.searchParams.set("crkyCn", apiKey);
    url.searchParams.set("hblNo", hblNo);
    url.searchParams.set("blYy", blYy);

    // 통관은 초단위 실시간이 아니라서 캐시(60~120초) 추천
    const resp = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "accept": "application/xml,text/xml,application/json,text/plain,*/*",
      },
    });

    const bodyText = await resp.text();

    if (!resp.ok) {
      // 유니패스가 XML 에러를 주는 경우가 많아서 원문 그대로 전달
      return {
        statusCode: resp.status,
        headers: {
          "content-type": resp.headers.get("content-type") || "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
        body: bodyText,
      };
    }

    return {
      statusCode: 200,
      headers: {
        "content-type": resp.headers.get("content-type") || "text/plain; charset=utf-8",
        "cache-control": "public, max-age=90",
      },
      body: bodyText,
    };
  } catch (e) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}
