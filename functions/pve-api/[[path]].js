// Cloudflare Pages Function – PVE API Proxy
// Handles /pve-api/* → https://<target>/api2/json/*

export async function onRequest(context) {
  const { request } = context;

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "*",
        "access-control-max-age": "86400",
      },
    });
  }

  const target = request.headers.get("x-pve-target");
  if (!target) {
    return Response.json({ error: "X-PVE-Target header missing" }, { status: 400 });
  }

  const [host, port = "8006"] = target.split(":");
  const url = new URL(request.url);
  const apiPath = url.pathname.replace(/^\/pve-api/, "/api2/json");
  const pveUrl = `https://${host}:${port}${apiPath}${url.search}`;

  // Forward only PVE-relevant headers
  const fwdHeaders = new Headers({ accept: "application/json" });
  for (const h of ["authorization", "content-type", "cookie", "csrfpreventiontoken"]) {
    const v = request.headers.get(h);
    if (v) fwdHeaders.set(h, v);
  }

  try {
    const pveRes = await fetch(pveUrl, {
      method: request.method,
      headers: fwdHeaders,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
    });

    const resHeaders = new Headers({
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
    });
    const ct = pveRes.headers.get("content-type");
    if (ct) resHeaders.set("content-type", ct);

    return new Response(pveRes.body, {
      status: pveRes.status,
      headers: resHeaders,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 });
  }
}
