const BUSINESS_ROUTE = /^\/(?:functions\/v1\/)?(?:app(?:-d[0-9a-f]{32})?)(\/.*)?$/;

export function businessPath(pathname: string): string {
  const matched = pathname.match(BUSINESS_ROUTE);
  return matched ? matched[1] || "/" : pathname;
}

function json(body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

export function handler(request: Request): Response {
  const path = businessPath(new URL(request.url).pathname);

  if (path === "/health") {
    if (request.method !== "GET") {
      return json({ ok: false, error: "method_not_allowed" }, 405, { allow: "GET" });
    }
    return json({ ok: true, service: "217-house", time: new Date().toISOString() });
  }

  return json({ ok: false, error: "not_found" }, 404);
}
