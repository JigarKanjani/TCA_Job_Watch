import "server-only";
import { timingSafeEqual } from "node:crypto";
import { originFrom } from "@/lib/redirect";

/** Compare a presented secret with the real one in constant time. */
export function safeEqual(got: string | null | undefined, want: string): boolean {
  const a = Buffer.from(got ?? "");
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * CSRF check for cookie-authenticated route handlers (server actions get the
 * same check from Next.js). Browsers send Origin and Sec-Fetch-Site on POSTs;
 * a request from another site is refused. Clients that send neither (curl,
 * the worker) aren't browsers, so they carry no victim's cookies anyway.
 */
export function sameOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (origin === null) return true; // not sent: not a cross-site browser request
  if (origin === "null") return false; // opaque origin (sandboxed frame, data: URL)
  try {
    return new URL(origin).host === new URL(originFrom(request)).host;
  } catch {
    return false;
  }
}
