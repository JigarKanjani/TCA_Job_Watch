"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moveJob, type Move } from "@/app/(app)/dashboard/actions";
import type { PayView } from "@/lib/pay/parse";
import { PayFinePrint, PayTag } from "./PayTag";

export type BoardJob = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  job_url: string;
  found_at: string;
  apply_by: string | null;
  pay: PayView | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const SHOW = 8;

function hms(ms: number) {
  const s = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s`;
}

function Countdown({ until }: { until: string }) {
  const end = new Date(until).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const left = end - now;
  const over = left <= 0;
  const urgent = !over && left < 3 * 3600 * 1000;
  return (
    <div className={`countdown ${over ? "over" : urgent ? "urgent" : ""}`}>
      <span className="cd-label">{over ? "Time's up, still apply" : "Apply within"}</span>
      <span className="cd-time" suppressHydrationWarning>
        {over ? `+${hms(left)}` : hms(left)}
      </span>
      <span className="cd-bar" aria-hidden="true">
        <i suppressHydrationWarning style={{ transform: `scaleX(${Math.max(0, Math.min(1, left / DAY_MS))})` }} />
      </span>
    </div>
  );
}

const meta = (j: BoardJob) => [j.company, j.location].filter(Boolean).join(" · ");

/** The sorted side of the dashboard: Super Apply on top, then To apply and Maybe. */
export function ApplyBoard({
  superJobs,
  toApply,
  maybe,
  counts,
  archived,
}: {
  superJobs: BoardJob[];
  toApply: BoardJob[];
  maybe: BoardJob[];
  counts: { toApply: number; maybe: number };
  archived: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, start] = useTransition();

  function act(id: string, move: Move) {
    setBusy(id);
    start(async () => {
      const r = await moveJob(id, move);
      if (!r.ok) {
        setToast(r.message ?? "Couldn't save that.");
        window.setTimeout(() => setToast(null), 4000);
      } else router.refresh();
      setBusy(null);
    });
  }

  const row = (j: BoardJob, actions: React.ReactNode) => (
    <li key={j.id} className={busy === j.id ? "is-busy" : undefined}>
      <div className="info">
        <Link href={`/jobs/${j.id}`}>
          <b>{j.title ?? "Untitled role"}</b>
        </Link>
        <span className="small muted">
          {meta(j) || "Details in the posting"}
          {j.pay && <PayTag pay={j.pay} className="pay-inline" />}
        </span>
      </div>
      <div className="row-actions">
        <a className="icon-btn" href={j.job_url} target="_blank" rel="noopener noreferrer" title="Open the posting" aria-label={`Open the posting for ${j.title ?? "this job"}`}>
          ↗
        </a>
        {actions}
      </div>
    </li>
  );

  return (
    <div className="board">
      {superJobs.length > 0 && (
        <section className="super-zone" aria-label="Super Apply">
          <div className="super-head">
            <span className="eyebrow eyebrow-hot">★ Super Apply</span>
            <h2>Apply to these today</h2>
            <p className="muted small">Applying in the first 24 hours gets the most replies. They stay pinned here until you apply.</p>
          </div>
          <div className="super-grid">
            {superJobs.map((j) => (
              <article key={j.id} className={`super-card ${busy === j.id ? "is-busy" : ""}`}>
                {j.apply_by && <Countdown until={j.apply_by} />}
                <h3>
                  <Link href={`/jobs/${j.id}`}>{j.title ?? "Untitled role"}</Link>
                </h3>
                <p className="muted small">{meta(j) || "Details in the posting"}</p>
                {j.pay && <PayTag pay={j.pay} />}
                <div className="row">
                  <a className="btn btn-accent btn-sm" href={j.job_url} target="_blank" rel="noopener noreferrer">
                    Apply now ↗
                  </a>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => act(j.id, "applied")}>
                    ✓ I applied
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => act(j.id, "unsuper")}>
                    Not today
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="board-cols">
        <section className="panel board-col" aria-label="To apply">
          <div className="row between">
            <span className="eyebrow">✓ To apply · {counts.toApply}</span>
            {counts.toApply > SHOW && <Link className="linklike small" href="/jobs?status=saved">See all →</Link>}
          </div>
          {toApply.length === 0 ? (
            <p className="muted small empty">Swipe right on jobs you want to apply to and they line up here.</p>
          ) : (
            <ul className="board-list">
              {toApply.slice(0, SHOW).map((j) =>
                row(
                  j,
                  <>
                    <button type="button" className="icon-btn hot" onClick={() => act(j.id, "super")} title="Super Apply: pin it with a 24-hour timer" aria-label="Super Apply">
                      ★
                    </button>
                    <button type="button" className="btn btn-outline btn-xs" onClick={() => act(j.id, "applied")}>
                      ✓ Applied
                    </button>
                    <button type="button" className="icon-btn" onClick={() => act(j.id, "discard")} title="Not interested (moves it to the archive)" aria-label="Not interested">
                      ✕
                    </button>
                  </>,
                ),
              )}
            </ul>
          )}
        </section>

        <section className="panel board-col" aria-label="Maybe">
          <div className="row between">
            <span className="eyebrow">? Maybe · {counts.maybe}</span>
            {counts.maybe > SHOW && <Link className="linklike small" href="/jobs?status=maybe">See all →</Link>}
          </div>
          {maybe.length === 0 ? (
            <p className="muted small empty">Swipe down on jobs you&apos;re unsure about. Decide later.</p>
          ) : (
            <ul className="board-list">
              {maybe.slice(0, SHOW).map((j) =>
                row(
                  j,
                  <>
                    <button type="button" className="btn btn-outline btn-xs" onClick={() => act(j.id, "apply")}>
                      Apply
                    </button>
                    <button type="button" className="icon-btn" onClick={() => act(j.id, "discard")} title="Not interested (moves it to the archive)" aria-label="Not interested">
                      ✕
                    </button>
                  </>,
                ),
              )}
            </ul>
          )}
        </section>
      </div>

      {[...superJobs, ...toApply.slice(0, SHOW), ...maybe.slice(0, SHOW)].some((j) => j.pay?.kind === "estimate") && <PayFinePrint />}
      <div className="board-foot small">
        <Link className="linklike" href="/jobs?status=not_interested">
          🗄 Archive · {archived} not interested →
        </Link>
        <Link className="linklike" href="/jobs">
          Full job log →
        </Link>
      </div>
      {toast && (
        <div className="board-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
