import "server-only";
import { searchFreehire } from "@/lib/freehire";
import { searchLinkedIn, type FoundJob } from "@/lib/linkedin";
import { jobKey } from "@/lib/matching";

// On-demand search across every source: LinkedIn's public job pages and
// freehire.me's employer-direct postings, side by side. Either source can
// fail on its own; the other still returns jobs.

type Opts = { role: string; city: string; country: string; workMode: string; hoursOld: number };

/** Alternate between sources so both show up in a capped batch; drop repeats. */
export function mergeJobs(...lists: FoundJob[][]): FoundJob[] {
  const out: FoundJob[] = [];
  const seen = new Set<string>();
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const j = list[i];
      if (!j || seen.has(j.job_url)) continue;
      const key = jobKey(j.title, j.company);
      if (key && seen.has(key)) continue;
      seen.add(j.job_url);
      if (key) seen.add(key);
      out.push(j);
    }
  }
  return out;
}

export async function searchJobs(opts: Opts): Promise<{ jobs: FoundJob[]; blocked: boolean }> {
  const [li, fh] = await Promise.all([
    searchLinkedIn(opts).catch(() => ({ jobs: [] as FoundJob[], blocked: false })),
    searchFreehire(opts).catch(() => [] as FoundJob[]),
  ]);
  // Employer-direct postings first when the same job is on both.
  return { jobs: mergeJobs(fh, li.jobs), blocked: li.blocked && fh.length === 0 };
}
