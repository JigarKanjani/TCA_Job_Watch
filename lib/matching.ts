// Per-alert filters for on-demand results. Mirrors matches_alert() in
// worker/run_alerts.py. The experience cap uses the minimum years a posting
// asks for, which freehire.me extracts; LinkedIn cards don't carry it, so
// those get the cap when the worker sees their description.
import type { FoundJob } from "./linkedin";

type AlertLike = {
  city: string;
  work_mode: string;
  min_salary: number | null;
  max_experience?: number | null;
  exclude_keywords: string[];
};

function annualFromText(salary: string | null): number | null {
  if (!salary) return null;
  const nums = [...salary.replace(/,/g, "").matchAll(/(\d+(?:\.\d+)?)\s*(k)?/gi)]
    .map((m) => Number(m[1]) * (m[2] ? 1000 : 1))
    .filter((n) => n > 0);
  if (!nums.length) return null;
  const top = Math.max(...nums);
  if (/\/\s*(hr|hour)|hourly/i.test(salary) || top < 300) return top * 2080;
  return top;
}

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9+#]+/)
    .filter(Boolean);

// Words that don't make a title relevant on their own.
const FILLER = new Set(["a", "an", "and", "the", "of", "for", "in", "at", "to", "with", "on", "senior", "sr", "junior", "jr", "remote", "hybrid", "job", "jobs", "role", "position"]);
const stem = (w: string) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w);

/**
 * Does a job title fit the alert's role? Every meaningful word of the role
 * (or of one of its comma / "or" alternatives) must start a word of the
 * title: "business analyst" keeps "Senior Business Analyst - Power BI" and
 * "Business Systems Analyst", drops "Financial Analyst". Used for sources
 * whose keyword search is loose (freehire.me); keep in sync with
 * title_matches_role() in worker/run_alerts.py.
 */
export function titleMatchesRole(role: string, title: string): boolean {
  const t = words(title);
  const options = role
    .split(/,|;|\||\bor\b/i)
    .map((alt) => words(alt).filter((w) => !FILLER.has(w)).map(stem))
    .filter((alt) => alt.length);
  if (!options.length) return true;
  return options.some((alt) => alt.every((w) => t.some((tw) => tw.startsWith(w))));
}

const COMPANY_SUFFIX = /\b(inc|incorporated|ltd|limited|llc|llp|corp|corporation|co|company|canada|group|ulc)\b/g;

/**
 * Same job, different link: the key two sources share for one posting
 * (title + employer, normalised). Null when the employer is unknown.
 */
export function jobKey(title: string | null | undefined, company: string | null | undefined): string | null {
  const c = (company ?? "").toLowerCase().replace(/\(.*?\)/g, " ").replace(COMPANY_SUFFIX, " ").replace(/[^a-z0-9]+/g, "");
  const t = (title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return c && t ? `key:${t}|${c}` : null;
}

/** `seen` holds job URLs and jobKey()s of jobs the user already has. */
export function matchesAlert(alert: AlertLike, job: FoundJob, seen: Set<string>): boolean {
  if (seen.has(job.job_url)) return false;
  const key = jobKey(job.title, job.company);
  if (key && seen.has(key)) return false;
  const title = job.title.toLowerCase();
  if (alert.exclude_keywords.some((k) => k && title.includes(k.toLowerCase()))) return false;

  const loc = (job.location ?? "").toLowerCase();
  const remoteJob = Boolean(job.is_remote) || loc.includes("remote") || title.includes("remote");
  if (alert.work_mode === "remote" && !remoteJob) return false;
  if (alert.work_mode === "onsite" && job.is_remote) return false;
  const city = alert.city.split(",")[0].trim().toLowerCase();
  if (city && alert.work_mode !== "remote" && loc && !loc.includes(city) && !(alert.work_mode === "any" && remoteJob)) return false;

  if (alert.min_salary) {
    const listed = annualFromText(job.salary);
    if (listed && listed < alert.min_salary) return false;
  }
  if (alert.max_experience != null && job.experience_min != null && job.experience_min > alert.max_experience) return false;
  return true;
}

/** Remember a kept job so later searches in the same run skip it. */
export function markSeen(seen: Set<string>, job: Pick<FoundJob, "job_url" | "title" | "company">) {
  seen.add(job.job_url);
  const key = jobKey(job.title, job.company);
  if (key) seen.add(key);
}

/** The `seen` set for a user: every link they have, plus recent jobs by title + employer. */
export function seenFrom(known: { job_url: string; title?: string | null; company?: string | null; found_at?: string | null }[]): Set<string> {
  const seen = new Set<string>();
  const recent = Date.now() - 60 * 24 * 3600 * 1000;
  for (const k of known) {
    seen.add(k.job_url);
    if (k.found_at && new Date(k.found_at).getTime() > recent) {
      const key = jobKey(k.title, k.company);
      if (key) seen.add(key);
    }
  }
  return seen;
}
