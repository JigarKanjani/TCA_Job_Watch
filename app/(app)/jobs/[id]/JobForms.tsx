"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { STATUSES } from "@/lib/config";
import type { DocumentRow, JobMatch } from "@/lib/types";
import { SubmitButton } from "@/components/SubmitButton";
import { RichText } from "@/components/RichText";
import { submitWith } from "@/lib/submit";
import { fetchDescription, saveDescription, updateTracker, type JobFormState } from "../actions";

type Doc = Pick<DocumentRow, "id" | "name" | "kind">;

export function TrackerForm({ job, resumes, covers }: { job: JobMatch; resumes: Doc[]; covers: Doc[] }) {
  const [state, action, pending] = useActionState<JobFormState, FormData>(updateTracker, {});
  // Controlled fields: React resets uncontrolled inputs after a form action,
  // which would briefly show stale values until the page re-renders.
  const [f, setF] = useState({
    status: job.status as string,
    applied_at: job.applied_at ?? "",
    resume_doc_id: job.resume_doc_id ?? "",
    cover_doc_id: job.cover_doc_id ?? "",
    notes: job.notes ?? "",
    title: job.title ?? "",
    company: job.company ?? "",
    location: job.location ?? "",
    salary: job.salary ?? "",
  });
  const bind = (k: keyof typeof f) => ({
    name: k,
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value })),
  });
  return (
    <form onSubmit={submitWith(action)} className="panel stack">
      <input type="hidden" name="id" value={job.id} />
      <span className="eyebrow">Application tracker</span>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="status">Stage</label>
          <select id="status" className="input" {...bind("status")}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="applied_at">Applied on</label>
          <input id="applied_at" type="date" className="input" {...bind("applied_at")} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="resume_doc_id">Resume used</label>
        <select id="resume_doc_id" className="input" {...bind("resume_doc_id")}>
          <option value="">— None yet —</option>
          {resumes.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="cover_doc_id">Cover letter used</label>
        <select id="cover_doc_id" className="input" {...bind("cover_doc_id")}>
          <option value="">— None —</option>
          {covers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {resumes.length + covers.length === 0 && (
          <span className="hint">
            <Link href="/documents" className="linklike">Upload your resumes and cover letters</Link> to pick them here.
          </span>
        )}
      </div>
      <div className="field">
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" className="input" rows={4} {...bind("notes")} placeholder="Recruiter name, interview dates, salary talk, follow-ups…" />
      </div>
      <details className="details-inline">
        <summary>Edit job details</summary>
        <div className="stack" style={{ paddingBottom: 12 }}>
          <input className="input" {...bind("title")} placeholder="Title" aria-label="Title" />
          <input className="input" {...bind("company")} placeholder="Company" aria-label="Company" />
          <input className="input" {...bind("location")} placeholder="Location" aria-label="Location" />
          <input className="input" {...bind("salary")} placeholder="Salary" aria-label="Salary" />
        </div>
      </details>
      {state.error && <p className="notice notice-err" role="alert">{state.error}</p>}
      {state.ok && <p className="notice notice-ok" role="status">{state.ok}</p>}
      <button type="submit" className="btn btn-dark" disabled={pending}>{pending ? "Saving…" : "Save tracker"}</button>
    </form>
  );
}

export function DescriptionPanel({ id, description }: { id: string; description: string | null }) {
  const [fetchState, fetchAction] = useActionState<JobFormState, FormData>(fetchDescription, {});
  const [saveState, saveAction, savePending] = useActionState<JobFormState, FormData>(saveDescription, {});
  const [editing, setEditing] = useState(!description);
  const [draft, setDraft] = useState(description ?? "");

  return (
    <div className="panel stack" style={{ minWidth: 0 }}>
      <div className="row between">
        <span className="eyebrow">Job description</span>
        <div className="row">
          <form action={fetchAction}>
            <input type="hidden" name="id" value={id} />
            <SubmitButton className="btn btn-outline btn-sm" pendingText="Reading the page…">
              {description ? "Re-fetch from link" : "Fetch from link"}
            </SubmitButton>
          </form>
          {description && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing((e) => !e)}>
              {editing ? "Done" : "Edit"}
            </button>
          )}
        </div>
      </div>
      {fetchState.error && <p className="notice notice-warn" role="status">{fetchState.error}</p>}
      {fetchState.ok && <p className="notice notice-ok" role="status">{fetchState.ok}</p>}
      {editing ? (
        <form onSubmit={submitWith(saveAction)} className="stack">
          <input type="hidden" name="id" value={id} />
          <textarea name="description" className="input" rows={16} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste the full job description here so you have it even after the posting comes down." />
          {saveState.error && <p className="notice notice-err" role="alert">{saveState.error}</p>}
          {saveState.ok && <p className="notice notice-ok" role="status">{saveState.ok}</p>}
          <button type="submit" className="btn btn-dark btn-sm" disabled={savePending}>{savePending ? "Saving…" : "Save description"}</button>
        </form>
      ) : (
        <div className="jd">{description ? <RichText text={description} /> : null}</div>
      )}
    </div>
  );
}
