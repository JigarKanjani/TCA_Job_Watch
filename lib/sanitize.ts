// Input hygiene for everything users send us: form fields, server-action
// arguments, query strings and API bodies.
//
// SQL injection: no query is ever built from strings. Supabase (PostgREST)
// takes values as parameters and database functions use typed arguments with
// no dynamic SQL. The one place user text is written into a filter string is
// the job-log search; it goes through filterTerm() so it can't add or change
// filter conditions. Everything else here keeps values well-formed: the right
// type, trimmed, length-capped and free of control characters.

// Control characters (except tab, newline, carriage return), zero-width and
// bidi-override characters.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/g;

const str = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : "");

/** One line of text: whitespace collapsed, control characters removed, capped at `max`. */
export function cleanText(v: unknown, max: number): string {
  return str(v).normalize("NFC").replace(CONTROL, "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Free text that keeps its line breaks (notes, descriptions, resumes). */
export function cleanMultiline(v: unknown, max: number): string {
  return str(v)
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, max);
}

export const cleanOrNull = (v: unknown, max: number) => cleanText(v, max) || null;
export const multilineOrNull = (v: unknown, max: number) => cleanMultiline(v, max) || null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
export const uuidOrNull = (v: unknown) => (isUuid(str(v)) ? str(v) : null);

/** `v` if it's one of `allowed`, otherwise `fallback`. */
export function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  const s = str(v);
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

/** A calendar date (YYYY-MM-DD) that actually exists, or null. */
export function isoDateOrNull(v: unknown): string | null {
  const s = str(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

/** An integer clamped to [min, max], or `fallback` when it isn't a number. */
export function intIn(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number.parseInt(str(v), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
}

/**
 * A search term that is safe inside a PostgREST filter string such as
 * `or(title.ilike."%term%",...)`: only letters, numbers, spaces and a few
 * harmless symbols survive, so it can't close the value, add a condition
 * (commas, parentheses, dots outside quotes) or widen an ilike (% and _).
 */
export function filterTerm(v: unknown, max = 80): string {
  return cleanText(v, max * 2)
    .replace(/[^\p{L}\p{N} .'&+#/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
