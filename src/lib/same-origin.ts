/**
 * The app's POST routes are called by its own pages with fetch and a JSON body.
 * A page on another site can only send a form (urlencoded, multipart, or
 * text/plain) or a fetch the browser marks as cross-site, so requiring JSON from
 * the same origin stops cross-site request forgery even if a session cookie
 * were sent along. Scripts and tests without a browser send neither header.
 */
export function refuseCrossSite(request: Request): Response | null {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return Response.json({ error: "Cross-site requests aren't allowed." }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (!site && origin) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      // "null" or garbage: not our origin
    }
    if (!host || originHost !== host) return Response.json({ error: "Cross-site requests aren't allowed." }, { status: 403 });
  }
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) {
    return Response.json({ error: "Send JSON." }, { status: 415 });
  }
  return null;
}
