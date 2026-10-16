// Per-alert filters for on-demand results. Mirrors matches_alert() in
// worker/run_alerts.py (the worker also has job descriptions, so it can apply
// the experience cap; on-demand results get that filter when fetched later).
import type { FoundJob } from "./linkedin";

type AlertLike = {
  city: string;
  work_mode: string;
  min_salary: number | null;
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

export function matchesAlert(alert: AlertLike, job: FoundJob, seen: Set<string>): boolean {
  if (seen.has(job.job_url)) return false;
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
  return true;
}
