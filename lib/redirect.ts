// Only allow same-site relative paths, so ?next= can't bounce users elsewhere.
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

// The public origin, respecting Vercel's proxy headers.
export function originFrom(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  if (host && process.env.NODE_ENV !== "development") return `${proto}://${host}`;
  return url.origin;
}
