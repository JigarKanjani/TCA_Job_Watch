"use client";

import { useActionState } from "react";
import { addJob, type JobFormState } from "../actions";
import { submitWith } from "@/lib/submit";

export function AddJobForm() {
  const [state, action, pending] = useActionState<JobFormState, FormData>(addJob, {});
  return (
    <form onSubmit={submitWith(action)} className="stack">
      <div className="field">
        <label htmlFor="job_url">Job posting link</label>
        <input id="job_url" name="job_url" className="input input-lg" type="url" required placeholder="https://…" autoFocus />
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="title">Title <span className="hint">(optional)</span></label>
          <input id="title" name="title" className="input" placeholder="Filled in automatically if blank" />
        </div>
        <div className="field">
          <label htmlFor="company">Company <span className="hint">(optional)</span></label>
          <input id="company" name="company" className="input" placeholder="Filled in automatically if blank" />
        </div>
      </div>
      <div className="field">
        <span className="label">Stage</span>
        <select name="status" className="input" defaultValue="saved" aria-label="Stage">
          <option value="saved">Saved — thinking about it</option>
          <option value="applied">Applied already</option>
          <option value="interviewing">Interviewing</option>
        </select>
      </div>
      {state.error && <p className="notice notice-err" role="alert">{state.error}</p>}
      <button type="submit" className="btn btn-accent" disabled={pending}>{pending ? "Reading the posting…" : "Add to my log"}</button>
    </form>
  );
}
