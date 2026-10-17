"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moveJob } from "@/app/(app)/dashboard/actions";
import { FindJobsButton } from "./FindJobsButton";
import { PayFinePrint, PayTag } from "./PayTag";
import type { PayView } from "@/lib/pay/parse";

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
  pay: PayView | null;
};

type Decision = "apply" | "super" | "maybe" | "discard";

const THRESHOLD_X = 110;
const THRESHOLD_Y = 100;
const DEMO_TOAST = "Demo mode: picks aren't saved. Create an account to keep them.";

function ago(iso: string) {
  const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, Math.round(m))} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Dashboard banner + the sorting pop-up. The pop-up opens by itself once per
 * visit (and after every new sign-in) while unsorted jobs are waiting, and
 * again whenever "Find jobs now" brings in new ones.
 */
export function TriageLauncher({
  jobs,
  total,
  demo = false,
  loginStamp,
}: {
  jobs: DeckJob[];
  total: number;
  demo?: boolean;
  loginStamp: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deckJobs, setDeckJobs] = useState<DeckJob[]>([]);
  const [session, setSession] = useState(0);
  const wantOpen = useRef(false);
  const startBtn = useRef<HTMLButtonElement>(null);
  const storageKey = `jw-triage-${loginStamp}`;

  const openWith = useCallback((list: DeckJob[]) => {
    if (!list.length) return;
    setDeckJobs(list);
    setSession((s) => s + 1);
    setOpen(true);
  }, []);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(storageKey) === "1";
    } catch {}
    if (!seen && jobs.length) openWith(jobs);
    // Only on first load of the dashboard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onFound = (e: Event) => {
      if ((e as CustomEvent<number>).detail > 0) wantOpen.current = true;
    };
    window.addEventListener("jobwatch:found", onFound);
    return () => window.removeEventListener("jobwatch:found", onFound);
  }, []);

  useEffect(() => {
    if (wantOpen.current && jobs.length) {
      wantOpen.current = false;
      openWith(jobs);
    }
  }, [jobs, openWith]);

  const close = useCallback(
    (changed: boolean) => {
      setOpen(false);
      try {
        sessionStorage.setItem(storageKey, "1");
      } catch {}
      if (changed) router.refresh();
      window.setTimeout(() => startBtn.current?.focus(), 0);
    },
    [router, storageKey],
  );

  return (
    <>
      <section className={`panel triage-banner ${total ? "has-jobs" : ""}`} aria-label="New matches">
        <div className="tb-stack" aria-hidden="true">
          <i />
          <i />
          <b>{total > 99 ? "99+" : total}</b>
        </div>
        <div className="tb-copy">
          <span className="eyebrow">New matches</span>
          <h2>{total ? `${plural(total, "new job")} waiting to be sorted` : "You're all caught up"}</h2>
          <p className="muted small">
            {total
              ? "Swipe through them in a minute: Apply, Maybe or Not interested. Super Apply pins a job to the top with a 24-hour timer."
              : "New roles pop up here to sort as soon as they're found."}
          </p>
        </div>
        <div className="tb-actions">
          {total > 0 && (
            <button ref={startBtn} type="button" className="btn btn-accent btn-glow" onClick={() => openWith(jobs)}>
              ▶ Start sorting
            </button>
          )}
          <FindJobsButton className={total ? "btn btn-outline" : "btn btn-accent"} compact />
        </div>
      </section>
      {open && createPortal(<TriageModal key={session} jobs={deckJobs} demo={demo} onClose={close} />, document.body)}
    </>
  );
}

function TriageModal({
  jobs,
  demo,
  onClose,
}: {
  jobs: DeckJob[];
  demo: boolean;
  onClose: (changed: boolean) => void;
}) {
  const [deck, setDeck] = useState(jobs);
  const [history, setHistory] = useState<{ job: DeckJob; decision: Decision }[]>([]);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [leaving, setLeaving] = useState<Decision | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const pending = useRef<Promise<unknown>[]>([]);
  const changed = useRef(false);
  const demoWarned = useRef(false);
  const reduced = useRef(false);
  const zoom = useRef(1);
  const dialog = useRef<HTMLDivElement>(null);
  const total = jobs.length;
  const top = deck[0];

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Pointer coordinates are in screen pixels; the page may be zoomed on desktop.
    zoom.current = parseFloat(getComputedStyle(document.documentElement).zoom || "1") || 1;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3600);
  }, []);

  const finish = useCallback(async () => {
    if (closing) return;
    setClosing(true);
    await Promise.allSettled(pending.current);
    onClose(changed.current);
  }, [closing, onClose]);

  const commit = useCallback(
    (decision: Decision) => {
      if (!top || leaving) return;
      setLeaving(decision);
      const job = top;
      window.setTimeout(
        () => {
          setDeck((d) => d.slice(1));
          setHistory((h) => [...h, { job, decision }]);
          setLeaving(null);
          setDrag({ x: 0, y: 0, active: false });
        },
        reduced.current ? 0 : 300,
      );
      pending.current.push(
        moveJob(job.id, decision).then((r) => {
          if (r.ok) {
            changed.current = true;
            if (decision === "super") flash("★ Super Apply on: apply within 24 hours. It's pinned to the top of your dashboard.");
          } else if (r.demo) {
            if (!demoWarned.current) flash(DEMO_TOAST);
            demoWarned.current = true;
          } else flash(r.message ?? "Couldn't save that.");
        }),
      );
    },
    [top, leaving, flash],
  );

  const redo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last || leaving) return;
    setHistory((h) => h.slice(0, -1));
    setDeck((d) => [last.job, ...d]);
    pending.current.push(
      moveJob(last.job.id, "undo").then((r) => {
        if (r.ok) changed.current = true;
      }),
    );
  }, [history, leaving]);

  // ← not interested · → apply · ↑ super apply · ↓ maybe · Backspace/U/Z redo · Esc close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
        return;
      }
      if (e.key === "Tab") {
        const nodes = dialog.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
        if (!nodes?.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, Decision> = { ArrowLeft: "discard", ArrowRight: "apply", ArrowUp: "super", ArrowDown: "maybe" };
      if (map[e.key]) {
        e.preventDefault();
        commit(map[e.key]);
      } else if (e.key === "Backspace" || e.key.toLowerCase() === "u" || e.key.toLowerCase() === "z") {
        if (history.length) {
          e.preventDefault();
          redo();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit, redo, finish, history.length]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("a, button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    setDrag({ x: 0, y: 0, active: true });
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const k = zoom.current;
    setDrag({ x: (e.clientX - start.current.x) / k, y: (e.clientY - start.current.y) / k, active: true });
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const k = zoom.current;
    const dx = (e.clientX - start.current.x) / k;
    const dy = (e.clientY - start.current.y) / k;
    const dt = Math.max(1, performance.now() - start.current.t);
    start.current = null;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const dist = horizontal ? Math.abs(dx) : Math.abs(dy);
    const fling = dist / dt > 0.6 && dist > 40;
    if (horizontal && (Math.abs(dx) > THRESHOLD_X || fling)) commit(dx > 0 ? "apply" : "discard");
    else if (!horizontal && (Math.abs(dy) > THRESHOLD_Y || fling)) commit(dy < 0 ? "super" : "maybe");
    else setDrag({ x: 0, y: 0, active: false });
  }

  const counts = history.reduce(
    (c, h) => ({ ...c, [h.decision]: c[h.decision] + 1 }),
    { apply: 0, super: 0, maybe: 0, discard: 0 } as Record<Decision, number>,
  );
  const reviewed = total - deck.length;
  const horizontal = Math.abs(drag.x) >= Math.abs(drag.y);
  const x = leaving === "apply" ? 720 : leaving === "discard" ? -720 : leaving ? 0 : drag.x;
  const y = leaving === "super" ? -640 : leaving === "maybe" ? 560 : leaving ? 0 : drag.y;
  const rot = leaving === "apply" ? 20 : leaving === "discard" ? -20 : leaving ? 0 : drag.x * 0.06;
  const op = {
    apply: leaving === "apply" ? 1 : horizontal ? clamp01(drag.x / THRESHOLD_X) : 0,
    discard: leaving === "discard" ? 1 : horizontal ? clamp01(-drag.x / THRESHOLD_X) : 0,
    super: leaving === "super" ? 1 : !horizontal ? clamp01(-drag.y / THRESHOLD_Y) : 0,
    maybe: leaving === "maybe" ? 1 : !horizontal ? clamp01(drag.y / THRESHOLD_Y) : 0,
  };
  const tint = (Object.entries(op) as [Decision, number][]).sort((a, b) => b[1] - a[1])[0];

  return (
    <div
      className="triage-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) finish();
      }}
    >
      <div
        ref={dialog}
        className="triage"
        role="dialog"
        aria-modal="true"
        aria-labelledby="triage-title"
        tabIndex={-1}
      >
        <div className="triage-progress" aria-hidden="true">
          <i style={{ transform: `scaleX(${total ? reviewed / total : 1})` }} />
        </div>
        <div className="triage-head">
          <div>
            <span className="eyebrow">{top ? `${Math.min(reviewed + 1, total)} of ${total}` : "Done"}</span>
            <h2 id="triage-title">{top ? "Sort your new jobs" : "All sorted!"}</h2>
          </div>
          <button type="button" className="triage-close" onClick={finish} aria-label="Close and finish later">
            ✕
          </button>
        </div>
        {top && (
          <p className="triage-keys small muted">
            <span><kbd>→</kbd> Apply</span>
            <span><kbd>↑</kbd> Super Apply</span>
            <span><kbd>↓</kbd> Maybe</span>
            <span><kbd>←</kbd> Not interested</span>
          </p>
        )}

        <div className="deck">
          {top ? (
            <>
              {deck.slice(1, 3).reverse().map((j, i, arr) => {
                const depth = arr.length - i;
                return (
                  <div
                    key={j.id}
                    className="swipe-card ghost"
                    style={{ transform: `translateY(${depth * 10}px) scale(${1 - depth * 0.04})`, opacity: 1 - depth * 0.25 }}
                    aria-hidden="true"
                  />
                );
              })}
              <div
                key={top.id}
                className={`swipe-card ${drag.active ? "dragging" : ""} ${leaving ? "leaving" : ""}`}
                style={{ transform: `translate(${x}px, ${y}px) rotate(${rot}deg)` }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                aria-live="polite"
              >
                <span className={`sc-tint tint-${tint[0]}`} style={{ opacity: tint[1] * 0.16 }} aria-hidden="true" />
                <span className="stamp stamp-apply" style={{ opacity: op.apply }}>Apply</span>
                <span className="stamp stamp-pass" style={{ opacity: op.discard }}>Nope</span>
                <span className="stamp stamp-super" style={{ opacity: op.super }}>★ Super Apply</span>
                <span className="stamp stamp-maybe" style={{ opacity: op.maybe }}>Maybe</span>
                <div className="sc-top">
                  <span className="tag">{top.site === "indeed" ? "Indeed" : top.site === "linkedin" ? "LinkedIn" : top.site ?? "Job"}</span>
                  <span className="small muted">found {ago(top.found_at)}</span>
                </div>
                <h3 className="sc-title">{top.title ?? "Untitled role"}</h3>
                <p className="sc-company">{top.company ?? "Company not listed"}</p>
                {top.pay && (
                  <p className="sc-pay">
                    <PayTag pay={top.pay} />
                  </p>
                )}
                <div className="meta">
                  {top.location && <span className="tag tag-muted">📍 {top.location}</span>}
                  {top.is_remote && <span className="tag tag-muted">Remote</span>}
                  {top.date_posted && <span className="tag tag-muted">Posted {top.date_posted}</span>}
                </div>
                {top.snippet && <p className="sc-snippet">{top.snippet}</p>}
                {top.alertRole && <p className="hint">Matched your “{top.alertRole}” alert</p>}
                {top.pay?.kind === "estimate" && <PayFinePrint short className="sc-fine" />}
              </div>
            </>
          ) : (
            <div className="deck-empty">
              <div className="deck-empty-mark" aria-hidden="true">✓</div>
              <p>
                <b>{reviewed ? `You sorted ${plural(reviewed, "job")}.` : "Nothing left to sort."}</b>
              </p>
              <ul className="triage-summary small">
                {counts.super > 0 && <li className="s-super">★ {counts.super} super apply</li>}
                {counts.apply > 0 && <li className="s-apply">✓ {counts.apply} to apply</li>}
                {counts.maybe > 0 && <li className="s-maybe">? {counts.maybe} maybe</li>}
                {counts.discard > 0 && <li className="s-pass">✕ {counts.discard} not interested</li>}
              </ul>
              {counts.super > 0 && (
                <p className="muted small" style={{ maxWidth: "40ch" }}>
                  Your Super Apply timer is running. Apply within 24 hours for the best shot at a reply.
                </p>
              )}
              <div className="row" style={{ justifyContent: "center" }}>
                <button type="button" className="btn btn-accent btn-sm" onClick={finish} disabled={closing}>
                  {closing ? "Saving…" : "See my list"}
                </button>
                {history.length > 0 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={redo}>
                    ↶ Redo last
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {top && (
          <div className="deck-controls">
            <button type="button" className="swipe-btn pass" onClick={() => commit("discard")} aria-label="Not interested (left arrow)">
              ✕<span>Nope</span>
            </button>
            <button type="button" className="swipe-btn maybe sm" onClick={() => commit("maybe")} aria-label="Maybe (down arrow)">
              ?<span>Maybe</span>
            </button>
            <a className="deck-open" href={top.job_url} target="_blank" rel="noopener noreferrer" aria-label="Open the job posting in a new tab">
              ↗<span className="long">Open posting</span>
              <span className="short">Open</span>
            </a>
            <button type="button" className="swipe-btn super sm" onClick={() => commit("super")} aria-label="Super Apply: pin it with a 24-hour timer (up arrow)">
              ★<span>Super</span>
            </button>
            <button type="button" className="swipe-btn apply" onClick={() => commit("apply")} aria-label="Apply (right arrow)">
              ✓<span>Apply</span>
            </button>
          </div>
        )}

        <div className="deck-foot small muted">
          <button type="button" className="redo-btn" onClick={redo} disabled={!history.length || Boolean(leaving)}>
            ↶ Redo
          </button>
          <span>
            ✓ {counts.apply} · ★ {counts.super} · ? {counts.maybe} · ✕ {counts.discard}
          </span>
          {top && (
            <Link className="linklike" href={`/jobs/${top.id}`}>
              Details & tracker →
            </Link>
          )}
        </div>

        {toast && (
          <div className="deck-toast" role="status">
            {toast}
          </div>
        )}
        {demo && !toast && reviewed === 0 && (
          <p className="hint" style={{ textAlign: "center", margin: 0 }}>
            Demo: try it, picks aren&apos;t saved.
          </p>
        )}
      </div>
    </div>
  );
}
