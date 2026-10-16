"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { swipeJob } from "@/app/(app)/dashboard/actions";
import { FindJobsButton } from "./FindJobsButton";

export type DeckJob = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  salary: string | null;
  site: string | null;
  is_remote: boolean | null;
  date_posted: string | null;
  found_at: string;
  job_url: string;
  snippet: string | null;
  alertRole: string | null;
};

type Decision = "save" | "discard";
const THRESHOLD = 110;

function ago(iso: string) {
  const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, Math.round(m))} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

export function SwipeDeck({ jobs, demo = false }: { jobs: DeckJob[]; demo?: boolean }) {
  const [deck, setDeck] = useState(jobs);
  const [history, setHistory] = useState<{ job: DeckJob; decision: Decision }[]>([]);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [leaving, setLeaving] = useState<Decision | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [counts, setCounts] = useState({ saved: 0, passed: 0 });
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const reduced = useRef(false);
  const total = jobs.length;

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    setDeck(jobs);
  }, [jobs]);

  const top = deck[0];

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3200);
  }, []);

  const commit = useCallback(
    (decision: Decision) => {
      if (!top || leaving) return;
      setLeaving(decision);
      const job = top;
      window.setTimeout(
        () => {
          setDeck((d) => d.slice(1));
          setHistory((h) => [...h, { job, decision }]);
          setCounts((c) => (decision === "save" ? { ...c, saved: c.saved + 1 } : { ...c, passed: c.passed + 1 }));
          setLeaving(null);
          setDrag({ x: 0, y: 0, active: false });
        },
        reduced.current ? 0 : 280,
      );
      swipeJob(job.id, decision).then((r) => {
        if (r.demo) flash("Demo mode: swipes aren't saved. Create an account to keep your picks.");
        else if (!r.ok) flash(r.message ?? "Couldn't save that swipe.");
      });
    },
    [top, leaving, flash],
  );

  const undo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last || leaving) return;
    setHistory((h) => h.slice(0, -1));
    setDeck((d) => [last.job, ...d]);
    setCounts((c) => (last.decision === "save" ? { ...c, saved: c.saved - 1 } : { ...c, passed: c.passed - 1 }));
    swipeJob(last.job.id, "undo");
  }, [history, leaving]);

  // Keyboard: ← pass, → save, Backspace / U undo (ignored while typing).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); commit("discard"); }
      else if (e.key === "ArrowRight") { e.preventDefault(); commit("save"); }
      else if (e.key === "Backspace" || e.key.toLowerCase() === "u") { if (history.length) { e.preventDefault(); undo(); } }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit, undo, history.length]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("a, button")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    setDrag({ x: 0, y: 0, active: true });
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    setDrag({ x: e.clientX - start.current.x, y: (e.clientY - start.current.y) * 0.25, active: true });
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dt = Math.max(1, performance.now() - start.current.t);
    const fling = Math.abs(dx) / dt > 0.6 && Math.abs(dx) > 40;
    start.current = null;
    if (Math.abs(dx) > THRESHOLD || fling) commit(dx > 0 ? "save" : "discard");
    else setDrag({ x: 0, y: 0, active: false });
  }

  const reviewed = total - deck.length;
  const flyX = leaving === "save" ? 1 : leaving === "discard" ? -1 : 0;
  const x = leaving ? flyX * 640 : drag.x;
  const rot = leaving ? flyX * 22 : drag.x * 0.06;
  const saveOpacity = leaving === "save" ? 1 : Math.max(0, Math.min(1, drag.x / THRESHOLD));
  const passOpacity = leaving === "discard" ? 1 : Math.max(0, Math.min(1, -drag.x / THRESHOLD));

  return (
    <section className="deck-wrap" aria-label="Swipe through new matches">
      <div className="deck-head">
        <div>
          <span className="eyebrow">New matches</span>
          <h2>{top ? "Swipe to sort your matches" : "You're all caught up"}</h2>
          <p className="muted small">
            {top
              ? <>Drag right or press <kbd>→</kbd> to save · drag left or press <kbd>←</kbd> to pass</>
              : "New roles land here as soon as they're found."}
          </p>
        </div>
        <FindJobsButton compact />
      </div>

      <div className="deck">
        {deck.length === 0 ? (
          <div className="deck-empty">
            <div className="deck-empty-mark" aria-hidden="true">✓</div>
            <p><b>{reviewed ? `Nice — you sorted ${reviewed} job${reviewed === 1 ? "" : "s"}.` : "No new matches to sort right now."}</b></p>
            <p className="muted small">{counts.saved ? `${counts.saved} saved to your log. ` : ""}Hit “Find jobs now” or check back later.</p>
            <div className="row" style={{ justifyContent: "center" }}>
              <Link className="btn btn-outline btn-sm" href="/jobs?status=saved">See saved jobs</Link>
              {history.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={undo}>↶ Undo last</button>}
            </div>
          </div>
        ) : (
          <>
            {deck.slice(1, 3).reverse().map((j, i, arr) => {
              const depth = arr.length - i; // 2 = furthest back
              return <div key={j.id} className="swipe-card ghost" style={{ transform: `translateY(${depth * 10}px) scale(${1 - depth * 0.04})`, opacity: 1 - depth * 0.25 }} aria-hidden="true" />;
            })}
            <div
              key={top.id}
              className={`swipe-card ${drag.active ? "dragging" : ""} ${leaving ? "leaving" : ""}`}
              style={{ transform: `translate(${x}px, ${leaving ? 0 : drag.y}px) rotate(${rot}deg)` }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              aria-live="polite"
            >
              <span className="stamp stamp-save" style={{ opacity: saveOpacity }}>Save</span>
              <span className="stamp stamp-pass" style={{ opacity: passOpacity }}>Pass</span>
              <div className="sc-top">
                <span className="tag">{top.site === "indeed" ? "Indeed" : top.site === "linkedin" ? "LinkedIn" : top.site ?? "Job"}</span>
                <span className="small muted">found {ago(top.found_at)}</span>
              </div>
              <h3 className="sc-title">{top.title ?? "Untitled role"}</h3>
              <p className="sc-company">{top.company ?? "Company not listed"}</p>
              <div className="meta">
                {top.location && <span className="tag tag-muted">📍 {top.location}</span>}
                {top.is_remote && <span className="tag tag-muted">Remote</span>}
                {top.salary && <span className="tag tag-muted">💰 {top.salary}</span>}
                {top.date_posted && <span className="tag tag-muted">Posted {top.date_posted}</span>}
              </div>
              {top.snippet && <p className="sc-snippet">{top.snippet}</p>}
              {top.alertRole && <p className="hint">Matched your “{top.alertRole}” alert</p>}
            </div>
          </>
        )}
      </div>

      {top && (
        <div className="deck-controls">
          <button type="button" className="swipe-btn pass" onClick={() => commit("discard")} aria-label="Pass on this job (left arrow)">
            ✕<span>Pass</span>
          </button>
          <a className="btn btn-outline deck-open" href={top.job_url} target="_blank" rel="noopener noreferrer">
            Open posting ↗
          </a>
          <button type="button" className="swipe-btn save" onClick={() => commit("save")} aria-label="Save this job (right arrow)">
            ♥<span>Save</span>
          </button>
        </div>
      )}

      <div className="deck-foot small muted">
        {total > 0 && <span>{Math.min(reviewed + (top ? 1 : 0), total)} of {total}</span>}
        <span>♥ {counts.saved} saved · ✕ {counts.passed} passed</span>
        {history.length > 0 && top && <button type="button" className="linklike" onClick={undo}>↶ Undo</button>}
        {top && <Link className="linklike" href={`/jobs/${top.id}`}>Details & tracker →</Link>}
      </div>

      {toast && <div className="deck-toast" role="status">{toast}</div>}
      {demo && !toast && reviewed === 0 && <p className="hint" style={{ textAlign: "center" }}>Demo: try swiping — picks aren&apos;t saved.</p>}
    </section>
  );
}
