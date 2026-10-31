import "server-only";
import { APP_NAME } from "@/lib/config";
import { htmlToText } from "@/lib/jd";
import type { FoundJob } from "@/lib/linkedin";
import { titleMatchesRole } from "@/lib/matching";
import { formatRange, type Period } from "@/lib/pay/parse";
import { allow } from "@/lib/ratelimit";
import type { Reality, Requirement } from "@/lib/types";

// Employer-direct postings from freehire.me, an open-source job index
// (github.com/strelov1/freehire) that reads Workday, Greenhouse, Lever,
// Oracle, Dayforce and other career sites. Each posting comes with an
// "is this job real?" read-out (fresh / stale / evergreen, reposts), the
// listed requirements and the minimum years asked for.
//
// Public, keyless API (about 300 requests a minute per caller). We send only
// the search itself — role, city, country — never anything about the user.
// Every failure (timeout, bad JSON, rate limit) returns no jobs; LinkedIn
// results still come through.

const API = "https://freehire.me/api/v1/agent/jobs/search";
const UA = `${APP_NAME}/1.0 (job alerts; +https://tca-job-watch.vercel.app)`;
const TIMEOUT_MS = 8000;

type Opts = { role: string; city: string; country: string; workMode: string; hoursOld: number; limit?: number };
type Raw = Record<string, unknown>;

const obj = (v: unknown): Raw | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null);
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const int = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 10_000_000 ? v : null);

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

/** Some career sites report no employer name: an ADP tenant id or an Oracle host. */
function company(v: unknown): string | null {
  const c = str(v, 300);
  if (!c || UUID_LIKE.test(c) || /\.(com|net|io|ca)(\/|$)/i.test(c) || /^[\w-]+\.[\w.-]+\/\w+$/.test(c)) return null;
  return c;
}

function reality(v: unknown): Reality | null {
  const r = obj(v);
  if (!r) return null;
  const out: Reality = {};
  if (r.class === "fresh" || r.class === "stale" || r.class === "likely-evergreen") out.class = r.class;
  const age = int(r.age_days, 0, 9999);
  const reposts = int(r.repost_count, 0, 9999);
  const mass = int(r.mass_posting_count, 0, 99999);
  if (age !== undefined) out.age_days = age;
  if (reposts !== undefined) out.repost_count = reposts;
  if (mass !== undefined) out.mass_posting_count = mass;
  if (typeof r.fake_freshness === "boolean") out.fake_freshness = r.fake_freshness;
  return Object.keys(out).length ? out : null;
}

function requirements(v: unknown): Requirement[] | null {
  if (!Array.isArray(v)) return null;
  const out: Requirement[] = [];
  for (const item of v) {
    const r = obj(item);
    const text = str(r?.text, 300);
    if (!r || !text || text.length < 2) continue;
    out.push({ text, priority: r.priority === "preferred" ? "preferred" : "required" });
    if (out.length === 25) break;
  }
  return out.length ? out : null;
}

const PERIODS: Record<string, Period> = { year: "year", yearly: "year", hour: "hour", hourly: "hour", month: "month", monthly: "month" };

function salary(e: Raw | null): string | null {
  if (!e) return null;
  const lo = num(e.salary_min);
  const hi = num(e.salary_max);
  const period = PERIODS[String(e.salary_period ?? "year")];
  const cur = e.salary_currency;
  if ((!lo && !hi) || !period || (cur != null && cur !== "CAD" && cur !== "USD")) return null;
  const a = lo ?? hi!;
  const b = hi ?? lo!;
  return formatRange(Math.min(a, b), Math.max(a, b), period);
}

function httpsUrl(v: unknown): string | null {
  const s = str(v, 2000);
  if (!s) return null;
  try {
    return new URL(s).protocol === "https:" ? s : null;
  } catch {
    return null;
  }
}

/** One posting from the API, checked field by field. Null if it isn't usable. */
export function toJob(raw: unknown, countryCode: "ca" | "us"): FoundJob | null {
  const r = obj(raw);
  if (!r || r.closed_at) return null;
  const job_url = httpsUrl(r.url);
  const title = str(r.title, 300);
  if (!job_url || !title) return null;
  const countries = Array.isArray(r.countries) ? r.countries.filter((c): c is string => typeof c === "string") : [];
  if (countries.length && !countries.includes(countryCode)) return null;

  const e = obj(r.enrichment);
  const cities = Array.isArray(r.cities) ? r.cities.filter((c): c is string => typeof c === "string").slice(0, 3) : [];
  const where = str(r.location, 300) ?? (cities.length ? `${cities.join(", ")}, ${countryCode === "us" ? "United States" : "Canada"}` : null);
  const mode = r.work_mode;
  const source = typeof r.source === "string" && /^[a-z0-9-]{2,30}$/.test(r.source) ? r.source : "freehire";
  const posted = typeof r.posted_at === "string" && /^\d{4}-\d{2}-\d{2}/.test(r.posted_at) ? r.posted_at.slice(0, 10) : null;
  const html = typeof r.description === "string" ? r.description.slice(0, 200_000) : "";

  return {
    job_url,
    title,
    company: company(r.company),
    location: where,
    date_posted: posted,
    salary: salary(e),
    is_remote: mode === "remote" ? true : mode === "onsite" || mode === "hybrid" ? false : null,
    site: source,
    feed: "freehire",
    description: html ? htmlToText(html).slice(0, 20000) || null : null,
    reality: reality(r.reality),
    requirements: requirements(e?.requirements),
    experience_min: int(e?.experience_years_min, 0, 50) ?? null,
  };
}

// Identical searches within a few minutes (several users with the same alert,
// or a retry) are answered from memory on a warm server instead of the API.
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; jobs: FoundJob[] }>();

export async function searchFreehire(opts: Opts): Promise<FoundJob[]> {
  const cc = opts.country === "USA" ? "us" : "ca";
  const params = new URLSearchParams({
    q: opts.role.slice(0, 100),
    limit: String(Math.min(100, opts.limit ?? 50)),
    posted_within_days: String(Math.min(30, Math.max(1, Math.ceil(opts.hoursOld / 24)))),
  });
  const city = opts.city.split(",")[0].trim();
  // `cities` alone narrows to the city; adding `countries` widens it back to the
  // whole country, so the country filter is applied to the results instead.
  if (opts.workMode === "remote") {
    params.set("countries", cc);
    params.set("work_mode", "remote");
  } else if (city) {
    params.set("cities", city.toLowerCase());
  } else {
    params.set("countries", cc);
  }
  const url = `${API}?${params}`;

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.jobs.map((j) => ({ ...j }));

  try {
    if (!(await allow("freehire", "all"))) return [];
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return [];
    const body = obj(await res.json());
    const data = Array.isArray(body?.data) ? body.data : [];

    const jobs: FoundJob[] = [];
    const urls = new Set<string>();
    const named = new Set<string>();
    const parsed = data.map((d) => toJob(d, cc)).filter((j): j is FoundJob => j !== null && titleMatchesRole(opts.role, j.title));
    // The same opening is sometimes listed twice, once without the employer's
    // name; keep the named one.
    for (const j of parsed) if (j.company) named.add(`${j.title}|${j.location}`.toLowerCase());
    for (const j of parsed) {
      if (urls.has(j.job_url)) continue;
      if (!j.company && named.has(`${j.title}|${j.location}`.toLowerCase())) continue;
      urls.add(j.job_url);
      jobs.push(j);
    }

    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    cache.set(url, { at: Date.now(), jobs });
    return jobs.map((j) => ({ ...j }));
  } catch {
    return [];
  }
}
