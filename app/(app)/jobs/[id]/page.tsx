import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isDemoEmail } from "@/lib/demo";
import { entitlementsFor } from "@/lib/plans";
import { hostOf, shortDate, timeAgo } from "@/lib/format";
import type { DocumentRow, JobMatch } from "@/lib/types";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { deleteJob } from "../actions";
import { TrackerForm, DescriptionPanel } from "./JobForms";
import { ApplicationKit } from "@/components/kit/ApplicationKit";
import { PayFinePrint, PayTag } from "@/components/PayTag";
import { payView } from "@/lib/pay/estimate";
import { isUuid } from "@/lib/sanitize";

export const metadata: Metadata = { title: "Job" };

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ flash?: string }>;
}) {
  const { id } = await params;
  const { flash } = await searchParams;
  if (!isUuid(id)) notFound();
  const { supabase, user, profile } = await requireProfile();
  const [{ data: job }, { data: docs }] = await Promise.all([
    supabase.from("job_matches").select("*").eq("id", id).maybeSingle<JobMatch>(),
    supabase.from("documents").select("id, name, kind").order("created_at", { ascending: false }).returns<Pick<DocumentRow, "id" | "name" | "kind">[]>(),
  ]);
  if (!job) notFound();
  let alertRole: string | null = null;
  let alertCountry: string | null = null;
  if (job.alert_id) {
    const { data } = await supabase.from("alerts").select("role, country").eq("id", job.alert_id).maybeSingle();
    alertRole = data?.role ?? null;
    alertCountry = data?.country ?? null;
  }
  const pay = payView({ ...job, country: alertCountry });

  const resumes = (docs ?? []).filter((d) => d.kind === "resume");
  const covers = (docs ?? []).filter((d) => d.kind === "cover_letter");
  const baseResume = profile?.base_resume_doc_id ?? null;
  const defaultResume = [job.resume_doc_id, baseResume, resumes[0]?.id].find((id) => id && resumes.some((r) => r.id === id)) ?? null;
  const docsRemaining = entitlementsFor(profile?.plan).maxDocuments - (docs ?? []).length;

  return (
    <>
      <Flash code={flash} />
      <p className="small" style={{ marginBottom: 14 }}>
        <Link href="/jobs" className="linklike">← Job log</Link>
      </p>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <span className="eyebrow">{job.source === "alert" ? `Found by “${alertRole ?? "an alert"}”` : "Added by you"} · {timeAgo(job.found_at)}</span>
          <h1>{job.title ?? hostOf(job.job_url)}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {[job.company, job.location, job.date_posted ? `posted ${shortDate(job.date_posted)}` : null].filter(Boolean).join(" · ") || hostOf(job.job_url)}
          </p>
          {pay && (
            <div className="job-pay">
              <PayTag pay={pay} />
              <PayFinePrint pay={pay} />
            </div>
          )}
        </div>
        <a className="btn btn-accent" href={job.job_url} target="_blank" rel="noopener noreferrer">Open posting ↗</a>
      </div>

      <div className="dash-grid">
        <DescriptionPanel id={job.id} description={job.description} />
        <div className="stack">
          <TrackerForm job={job} resumes={resumes} covers={covers} />
          <div className="panel">
            <span className="eyebrow">Danger zone</span>
            <form action={deleteJob} style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={job.id} />
              <SubmitButton className="btn btn-danger btn-sm" pendingText="Removing…">Remove from my log</SubmitButton>
            </form>
          </div>
        </div>
      </div>

      <ApplicationKit
        jobId={job.id}
        jobUrl={job.job_url}
        company={job.company ?? ""}
        resumes={resumes.map((r) => ({ id: r.id, name: r.name }))}
        defaultResumeId={defaultResume}
        userId={user.id}
        demo={isDemoEmail(user.email)}
        docsRemaining={docsRemaining}
      />
    </>
  );
}

// Reading a resume and running AI drafts can take a few seconds.
export const maxDuration = 60;
