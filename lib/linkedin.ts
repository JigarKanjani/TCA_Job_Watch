import "server-only";
import { allow } from "@/lib/ratelimit";

// Fast on-demand search against LinkedIn's public job-search pages (the same
// source the scheduled JobSpy worker uses). Used by "Find jobs now", so it must
// finish in a few seconds: three result pages fetched in parallel.

export type FoundJob = {
  job_url: string;
  title: string;
  company: string | null;
  location: string | null;
  date_posted: string | null;
  salary: string | null;
  is_remote: boolean | null;
  site: "linkedin";
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const text = (s: string | undefined) => (s ? decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : "");

export function parseCards(html: string): FoundJob[] {
  const jobs: FoundJob[] = [];
  const cards = html.split(/<li[\s>]/).slice(1);
  for (const card of cards) {
    const href = card.match(/class="base-card__full-link[^"]*"[^>]*href="([^"]+)"/)?.[1];
    const id = href?.match(/-(\d{6,})(?:\?|$)/)?.[1] ?? card.match(/urn:li:jobPosting:(\d+)/)?.[1];
    const title = text(card.match(/<h3 class="base-search-card__title">([\s\S]*?)<\/h3>/)?.[1]);
    if (!id || !title) continue;
    const company = text(card.match(/<h4 class="base-search-card__subtitle">([\s\S]*?)<\/h4>/)?.[1]) || null;
    const location = text(card.match(/<span class="job-search-card__location">([\s\S]*?)<\/span>/)?.[1]) || null;
    const date = card.match(/<time class="job-search-card__listdate[^"]*" datetime="(\d{4}-\d{2}-\d{2})"/)?.[1] ?? null;
    const salary = text(card.match(/<span class="job-search-card__salary-info">([\s\S]*?)<\/span>/)?.[1]) || null;
    jobs.push({
      job_url: `https://www.linkedin.com/jobs/view/${id}`,
      title,
      company,
      location,
      date_posted: date,
      salary,
      is_remote: location ? /remote/i.test(location) : null,
      site: "linkedin",
    });
  }
  return jobs;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url: string, attempt = 0): Promise<{ status: number; html: string }> {
  // App-wide budget so many users searching at once stay under LinkedIn's radar.
  if (attempt === 0 && !(await allow("linkedin", "all"))) return { status: 429, html: "" };
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-CA,en;q=0.9" },
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    });
    // LinkedIn throttles bursts with 429; back off once and retry.
    if ((res.status === 429 || res.status === 999) && attempt < 1) {
      await sleep(1500 + Math.random() * 800);
      return fetchPage(url, attempt + 1);
    }
    return { status: res.status, html: res.ok ? await res.text() : "" };
  } catch {
    return { status: 0, html: "" };
  }
}

export async function searchLinkedIn(opts: {
  role: string;
  city: string;
  country: string;
  workMode: string;
  hoursOld: number;
  pages?: number;
}): Promise<{ jobs: FoundJob[]; blocked: boolean }> {
  const remote = opts.workMode === "remote";
  const countryName = opts.country === "USA" ? "United States" : "Canada";
  const location = remote || !opts.city ? countryName : `${opts.city}, ${countryName}`;
  const params = new URLSearchParams({
    keywords: opts.role,
    location,
    f_TPR: `r${Math.max(3600, Math.round(opts.hoursOld * 3600))}`,
  });
  if (remote) params.set("f_WT", "2");
  if (opts.workMode === "onsite") params.set("f_WT", "1");

  const seen = new Set<string>();
  const jobs: FoundJob[] = [];
  let blocked = false;
  // Pages one after another (not in parallel) — gentler on LinkedIn's rate limits.
  for (let i = 0; i < (opts.pages ?? 2); i++) {
    const { status, html } = await fetchPage(
      `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}&start=${i * 10}`,
    );
    if (status === 429 || status === 999) { blocked = true; break; }
    const batch = parseCards(html);
    for (const j of batch) {
      if (seen.has(j.job_url)) continue;
      seen.add(j.job_url);
      // The search itself filtered on work type, so trust it: LinkedIn often
      // lists remote roles with just the country as the location.
      if (remote) j.is_remote = true;
      if (opts.workMode === "onsite") j.is_remote = false;
      jobs.push(j);
    }
    if (batch.length < 10) break;
  }
  return { jobs, blocked: jobs.length === 0 && blocked };
}
