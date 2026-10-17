"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { deleteMyAccount, deleteMyData } from "./actions";

const PARTS: { what: string; label: string; ask: string }[] = [
  { what: "jobs", label: "Delete my job log", ask: "Delete every job in your log, with its stage, notes and description? This can't be undone." },
  { what: "documents", label: "Delete my documents", ask: "Delete all your resumes and cover letters, including the files? This can't be undone." },
  { what: "alerts", label: "Delete my alerts", ask: "Delete all your alerts? Searching and sending will stop. This can't be undone." },
  { what: "everything", label: "Delete all my data", ask: "Delete your job log, documents, alerts and connected channels, but keep your account? This can't be undone." },
];

const confirmOr = (ask: string) => (e: React.FormEvent<HTMLFormElement>) => {
  if (!window.confirm(ask)) e.preventDefault();
};

export function DataControls({ demo }: { demo: boolean }) {
  const [typed, setTyped] = useState("");
  const ready = typed.trim().toUpperCase() === "DELETE";
  return (
    <div className="data-controls">
      <div className="data-row">
        <div className="info">
          <b>Download my data</b>
          <span className="small muted">Your profile, alerts, job log, document list and brief history as a JSON file.</span>
        </div>
        <a className="btn btn-outline btn-sm" href="/settings/export" download>
          ⬇ Download
        </a>
      </div>

      <div className="data-row">
        <div className="info">
          <b>Delete some or all of your data</b>
          <span className="small muted">Your account stays, so you can start fresh.</span>
        </div>
        <div className="row">
          {PARTS.map((p) => (
            <form key={p.what} action={deleteMyData} onSubmit={confirmOr(p.ask)}>
              <input type="hidden" name="what" value={p.what} />
              <SubmitButton className={`btn btn-sm ${p.what === "everything" ? "btn-danger" : "btn-outline"}`} pendingText="Deleting…">
                {p.label}
              </SubmitButton>
            </form>
          ))}
        </div>
      </div>

      <form
        className="data-row danger-row"
        action={deleteMyAccount}
        onSubmit={confirmOr("Delete your JobWatch account and everything in it, permanently? You'll be signed out.")}
      >
        <div className="info">
          <b>Delete my account</b>
          <span className="small muted">
            Permanently removes your account, alerts, job log, documents and files, Telegram/Discord links and any scheduled emails. This
            can&apos;t be undone.
          </span>
        </div>
        <div className="row">
          <input
            className="input"
            name="confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type DELETE"
            aria-label="Type DELETE to confirm"
            autoComplete="off"
            disabled={demo}
          />
          <SubmitButton className="btn btn-danger btn-sm" pendingText="Deleting…" disabled={!ready || demo}>
            Delete my account
          </SubmitButton>
        </div>
      </form>
      {demo && <p className="hint">The demo account can&apos;t be deleted. Create your own account to try this.</p>}
    </div>
  );
}
