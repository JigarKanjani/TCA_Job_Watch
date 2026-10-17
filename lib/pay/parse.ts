// Reads pay out of whatever a posting gives us: JobSpy's "$62,400–$72,800/yr",
// LinkedIn's "CA$70,000.00/yr - CA$85,000.00/yr", Indeed's "$30 - $35 an hour",
// or a sentence in the job description ("The salary range is $75K to $90K").
// Pure functions, safe on client and server.

export type Period = "year" | "hour" | "month" | "week" | "day";
export type PayRange = { min: number; max: number; period: Period; currency: "CAD" | "USD" | null };

const HOURS_PER_YEAR = 2080;
const PER_YEAR: Record<Period, number> = { year: 1, hour: HOURS_PER_YEAR, month: 12, week: 52, day: 260 };

const AMOUNT = String.raw`(?:CA\$|C\$|CAD\s?\$?|US\$|USD\s?\$?|\$)\s?(\d{1,3}(?:[,\s]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?([kK])?(?![\d,]*\s?(?:[mMbB](?:illion)?\b))`;
const RANGE = new RegExp(`${AMOUNT}(?:\\s*(?:/\\s*(?:yr|year|hr|hour|mo|month))?)\\s*(?:-|–|—|to|and)\\s*${AMOUNT}`, "g");
const SINGLE = new RegExp(AMOUNT, "g");

function toNumber(raw: string, k?: string) {
  const n = Number(raw.replace(/[,\s]/g, ""));
  return k ? n * 1000 : n;
}

function periodNear(text: string): Period | null {
  const t = text.toLowerCase();
  if (/\/\s*h(ou)?r\b|per hour|an hour|hourly|\/hour|\bph\b/.test(t)) return "hour";
  if (/\/\s*mo(nth)?\b|per month|a month|monthly/.test(t)) return "month";
  if (/\/\s*w(ee)?k\b|per week|a week|weekly/.test(t)) return "week";
  if (/per day|a day|daily|\/day/.test(t)) return "day";
  if (/\/\s*y(ea)?r\b|per year|a year|annual|annum|yearly|salary/.test(t)) return "year";
  return null;
}

function currencyOf(text: string): PayRange["currency"] {
  if (/CA\$|C\$|CAD/.test(text)) return "CAD";
  if (/US\$|USD/.test(text)) return "USD";
  return null;
}

function plausible(min: number, max: number, period: Period) {
  const lo = { hour: 10, day: 80, week: 350, month: 1500, year: 18000 }[period];
  const hi = { hour: 400, day: 3500, week: 15000, month: 70000, year: 1500000 }[period];
  return min >= lo && max <= hi && max >= min;
}

function build(min: number, max: number, context: string): PayRange | null {
  if (max < min) [min, max] = [max, min];
  let period = periodNear(context);
  if (!period) period = max < 400 ? "hour" : max < 20000 ? "month" : "year";
  if (period === "year" && max < 400) period = "hour"; // "$28 - $32 salary" is hourly
  if (!plausible(min, max, period)) return null;
  return { min, max, period, currency: currencyOf(context) };
}

/** Pay from a short salary field ("$70K–$85K/yr", "From $25 an hour"). */
export function parsePay(text: string | null | undefined): PayRange | null {
  if (!text) return null;
  RANGE.lastIndex = 0;
  const r = RANGE.exec(text);
  if (r) return build(toNumber(r[1], r[2]), toNumber(r[3], r[4] ?? r[2]), text);
  SINGLE.lastIndex = 0;
  const s = SINGLE.exec(text);
  if (s) {
    const n = toNumber(s[1], s[2]);
    return build(n, n, text);
  }
  return null;
}

const PAY_WORDS = /salary|pay|compensation|wage|rate|range|earn|base|hourly|per hour|annual|starting|\/hr|\/yr|ote/i;

/** Pay mentioned in a job description, only when it's clearly about pay. */
export function payFromDescription(desc: string | null | undefined): PayRange | null {
  if (!desc) return null;
  const text = desc.replace(/\\\$/g, "$").replace(/\*\*/g, "");
  RANGE.lastIndex = 0;
  for (let m = RANGE.exec(text); m; m = RANGE.exec(text)) {
    const ctx = text.slice(Math.max(0, m.index - 90), m.index + m[0].length + 40);
    if (!PAY_WORDS.test(ctx)) continue;
    const p = build(toNumber(m[1], m[2]), toNumber(m[3], m[4] ?? m[2]), ctx);
    if (p) return p;
  }
  SINGLE.lastIndex = 0;
  for (let m = SINGLE.exec(text); m; m = SINGLE.exec(text)) {
    const ctx = text.slice(Math.max(0, m.index - 60), m.index + m[0].length + 30);
    // A single figure only counts with an explicit period next to it.
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 18);
    if (!PAY_WORDS.test(ctx) || !periodNear(after)) continue;
    const n = toNumber(m[1], m[2]);
    const p = build(n, n, after);
    if (p) return p;
  }
  return null;
}

export function annualRange(p: PayRange): [number, number] {
  return [p.min * PER_YEAR[p.period], p.max * PER_YEAR[p.period]];
}

export function money(n: number, period: Period = "year") {
  if (period === "hour") return `$${n % 1 ? n.toFixed(2) : n.toFixed(0)}`;
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

const SUFFIX: Record<Period, string> = { year: "/yr", hour: "/hr", month: "/mo", week: "/wk", day: "/day" };

export function formatRange(min: number, max: number, period: Period = "year") {
  const a = money(min, period);
  const b = money(max, period);
  return `${a === b ? a : `${a}–${b}`}${SUFFIX[period]}`;
}

/** "$30–$35/hr (~$62k–$73k/yr)" — hourly pay also shown per year. */
export function describePay(p: PayRange) {
  const base = formatRange(p.min, p.max, p.period);
  if (p.period === "year") return base;
  const [a, b] = annualRange(p);
  return `${base} (~${formatRange(a, b)})`;
}

export const PAY_FINE_PRINT =
  "Est. = estimate from official wage data (Job Bank / U.S. BLS) for similar roles in the area, not from the employer. Real pay can vary a lot with the company, your experience and benefits.";

/** What lists and cards show: posted pay, or a labelled estimate. */
export type PayView = { kind: "posted" | "estimate"; text: string; note?: string };
