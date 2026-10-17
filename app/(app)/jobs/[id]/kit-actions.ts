"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireUser } from "@/lib/auth";
import { DEMO_MESSAGE, isDemoEmail } from "@/lib/demo";
import { analyzeFit, parseContact, splitSections, topAchievements } from "@/lib/kit/analyze";
import { aiEnabled, aiWrite, type AiKind } from "@/lib/kit/ai";
import { findEmails, type FinderInput, type FinderResult } from "@/lib/kit/emailFinder";
import { documentText } from "@/lib/kit/resumeText";
import { payView } from "@/lib/pay/estimate";
import type { KitContext } from "@/lib/kit/templates";

const UUID = /^[0-9a-f-]{36}$/i;

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
  if (!UUID.test(jobId) || (docId && !UUID.test(docId))) return { error: "Unknown job." };
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
    ai: aiEnabled(),
  };
}

export async function loadKit(jobId: string, docId: string | null) {
  return buildContext(jobId, docId);
}

export async function aiDraft(
  jobId: string,
  docId: string | null,
  kind: AiKind,
  extra: { recipient?: string; when?: string; topic?: string },
): Promise<{ text: string } | { error: string }> {
  const { user } = await requireUser();
  if (isDemoEmail(user.email)) return { error: "AI writing is off in the demo. Create a free account to use it." };
  const ctx = await buildContext(jobId, docId);
  if ("error" in ctx) return ctx;
  const clip = (s?: string) => (s ? s.slice(0, 200) : undefined);
  return aiWrite(kind, ctx, { recipient: clip(extra.recipient), when: clip(extra.when), topic: clip(extra.topic) });
}

export async function findRecipientEmail(input: FinderInput): Promise<FinderResult> {
  await requireUser();
  const clip = (s: string | undefined, n: number) => (s ?? "").trim().slice(0, n);
  return findEmails({
    first: clip(input.first, 60),
    last: clip(input.last, 60),
    company: clip(input.company, 120),
    domain: clip(input.domain, 120),
    jobUrl: clip(input.jobUrl, 2000),
  });
}

/** Link a document the kit just saved to this job's tracker. */
export async function attachDocToJob(jobId: string, docId: string, kind: "resume" | "cover_letter") {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) return { ok: false, message: DEMO_MESSAGE };
  if (!UUID.test(jobId) || !UUID.test(docId)) return { ok: false, message: "Unknown job." };
  const { error } = await supabase
    .from("job_matches")
    .update(kind === "resume" ? { resume_doc_id: docId } : { cover_doc_id: docId })
    .eq("id", jobId);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/documents");
  return error ? { ok: false, message: "Saved to your documents, but couldn't attach it to this job." } : { ok: true };
}
