"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireUser } from "@/lib/auth";
import { DEMO_MESSAGE, isDemoEmail } from "@/lib/demo";
import { analyzeFit, parseContact, splitSections, topAchievements } from "@/lib/kit/analyze";
import { findEmails, type FinderInput, type FinderResult } from "@/lib/kit/emailFinder";
import { documentText } from "@/lib/kit/resumeText";
import { payView } from "@/lib/pay/estimate";
import type { KitContext } from "@/lib/kit/templates";
import { allow, LIMITED } from "@/lib/ratelimit";
import { cleanText, isUuid } from "@/lib/sanitize";

// Job descriptions scraped as markdown carry escapes and emphasis marks.
const plainJd = (d: string | null) =>
  d
    ? d
        .replace(/\\([\\`*_{}[\]()#+\-.!>|~&])/g, "$1")
        .replace(/\*\*|__|^#+\s*/gm, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, 12000)
    : null;

async function buildContext(jobId: string, docId: string | null): Promise<KitContext | { error: string }> {
  const { supabase, user, profile } = await requireProfile();
  if (!isUuid(jobId) || (docId && !isUuid(docId))) return { error: "Unknown job." };
  if (!(await allow("kit", user.id))) return { error: LIMITED };
  const { data: job } = await supabase
    .from("job_matches")
    .select("id, title, company, location, job_url, description, salary, alert_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return { error: "That job isn't in your log." };

  let resume: string | null = null;
  let resumeName: string | null = null;
  let resumeError: string | null = null;
  if (docId) {
    const r = await documentText(supabase, docId);
    if ("error" in r) resumeError = r.error;
    else ({ text: resume, name: resumeName } = r);
  }
  const jd = plainJd(job.description as string | null);
  let country: string | null = null;
  if (job.alert_id) country = (await supabase.from("alerts").select("country").eq("id", job.alert_id).maybeSingle()).data?.country ?? null;
  const pay = payView({ title: job.title as string | null, location: job.location as string | null, salary: job.salary as string | null, description: job.description as string | null, country });
  const fit = analyzeFit(resume, jd);
  const contact = parseContact(resume, profile?.full_name ?? null, profile?.email ?? user.email ?? null);
  return {
    jobId,
    role: (job.title as string | null) ?? "this role",
    company: (job.company as string | null) ?? "your company",
    location: job.location as string | null,
    jobUrl: job.job_url as string,
    jd,
    resume,
    resumeName,
    resumeError,
    ...contact,
    ...fit,
    achievements: topAchievements(resume, fit.jdSkills),
    sections: splitSections(resume),
    pay: pay ? `${pay.text}${pay.kind === "estimate" ? ` (estimate: ${pay.note})` : " (from the posting)"}` : null,
  };
}

export async function loadKit(jobId: string, docId: string | null) {
  return buildContext(jobId, docId);
}

export async function findRecipientEmail(input: FinderInput): Promise<FinderResult> {
  const { user } = await requireUser();
  if (!(await allow("email_finder", user.id))) return { ok: false, error: LIMITED, domain: null, candidates: [], generic: [], companyOptions: [] };
  const o = (input ?? {}) as Partial<Record<keyof FinderInput, unknown>>;
  return findEmails({
    first: cleanText(o.first, 60),
    last: cleanText(o.last, 60),
    company: cleanText(o.company, 120),
    domain: cleanText(o.domain, 120),
    jobUrl: cleanText(o.jobUrl, 2000),
  });
}

/** Link a document the kit just saved to this job's tracker. */
export async function attachDocToJob(jobId: string, docId: string, kind: "resume" | "cover_letter") {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) return { ok: false, message: DEMO_MESSAGE };
  if (!isUuid(jobId) || !isUuid(docId) || (kind !== "resume" && kind !== "cover_letter")) return { ok: false, message: "Unknown job." };
  if (!(await allow("writes", user.id))) return { ok: false, message: LIMITED };
  const { error } = await supabase
    .from("job_matches")
    .update(kind === "resume" ? { resume_doc_id: docId } : { cover_doc_id: docId })
    .eq("id", jobId);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/documents");
  return error ? { ok: false, message: "Saved to your documents, but couldn't attach it to this job." } : { ok: true };
}
