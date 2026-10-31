import type { Reality } from "./types";

// How current is a posting? freehire.me tracks each opening over time
// (age, reposts, the same ad in many cities, a date bumped without changes);
// for other sources we only have the posted date.

export type Freshness = { tone: "ok" | "muted" | "warn"; label: string; detail: string };

const DAY = 24 * 60 * 60 * 1000;

function daysSince(date: string | null | undefined): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return null;
  const t = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / DAY));
}

const posted = (d: number) => (d === 0 ? "Posted today" : `Posted ${d}d ago`);

export function freshness(reality: Reality | null | undefined, datePosted: string | null | undefined): Freshness | null {
  const r = reality ?? {};
  const age = r.age_days ?? daysSince(datePosted);
  if (r.fake_freshness || r.class === "likely-evergreen") {
    return {
      tone: "warn",
      label: "Maybe evergreen",
      detail: "This ad looks always-open: re-posted or re-dated without real changes. It may be collecting résumés rather than filling a role now.",
    };
  }
  if ((r.repost_count ?? 0) >= 3) {
    return {
      tone: "warn",
      label: `Reposted ${r.repost_count}×`,
      detail: `Posted ${r.repost_count} times. The role may be hard to fill, or kept open.`,
    };
  }
  if (age === null) return null;
  if (age <= 3) return { tone: "ok", label: posted(age), detail: "Fresh posting: early applicants get the most attention." };
  if (age > 30 || r.class === "stale") {
    return { tone: "muted", label: posted(age), detail: "Older posting: it may already be filled. Worth a quick check before tailoring." };
  }
  return { tone: "muted", label: posted(age), detail: `Posted ${age} days ago.` };
}

const SITES: Record<string, string> = {
  linkedin: "LinkedIn", indeed: "Indeed", workday: "Workday", greenhouse: "Greenhouse", lever: "Lever",
  oracle: "Oracle", dayforce: "Dayforce", icims: "iCIMS", ashby: "Ashby", bamboohr: "BambooHR",
  workable: "Workable", smartrecruiters: "SmartRecruiters", ukg: "UKG", adp: "ADP", taleo: "Taleo",
  successfactors: "SuccessFactors", jazzhr: "JazzHR", paycom: "Paycom", paycor: "Paycor", recruitee: "Recruitee",
  startupjobs: "startup.jobs", "whatjobs-ca": "WhatJobs", adzuna: "Adzuna", amazon: "Amazon Jobs", freehire: "freehire",
};

/** "LinkedIn", "Workday", … for the source tag on a card. */
export function siteLabel(site: string | null | undefined): string {
  if (!site) return "Job";
  return SITES[site] ?? site.charAt(0).toUpperCase() + site.slice(1).replace(/-/g, " ");
}
