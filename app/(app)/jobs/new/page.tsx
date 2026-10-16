import type { Metadata } from "next";
import { AddJobForm } from "./AddJobForm";

export const metadata: Metadata = { title: "Add a job" };

export default function NewJobPage() {
  return (
    <div className="wrap-narrow" style={{ marginInline: "auto" }}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Track any posting</span>
          <h1>Add a job by link</h1>
        </div>
      </div>
      <div className="panel">
        <p className="muted" style={{ marginBottom: 18 }}>
          Paste a link from LinkedIn, Indeed, a company careers page, anywhere. We&apos;ll pull in the title, company and full
          job description when the page allows it.
        </p>
        <AddJobForm />
      </div>
    </div>
  );
}
