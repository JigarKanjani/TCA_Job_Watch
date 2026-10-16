import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { hostOf, placeLabel, timeAgo } from "@/lib/format";
import type { Alert, JobMatch } from "@/lib/types";
import { Flash } from "@/components/Flash";
import { StatusSelect } from "@/components/StatusSelect";
import { StatTile } from "@/components/charts/StatTile";
import { FunnelBars } from "@/components/charts/FunnelBars";
import { WeeklyColumns } from "@/components/charts/WeeklyColumns";
import { SwipeDeck, type DeckJob } from "@/components/SwipeDeck";
import { isDemoEmail } from "@/lib/demo";

export const metadata: Metadata = { title: "Overview" };

const APPLIED = new Set(["applied", "interviewing", "offer", "rejected", "withdrawn"]);
const INTERVIEWED = new Set(["interviewing", "offer"]);
const RESPONDED = new Set(["interviewing", "offer", "rejected"]);
const WEEK = 7 * 86400 * 1000;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ flash?: string }> }) {
  const { flash } = await searchParams;
  const { supabase, profile, user } = await requireProfile();
  const demo = isDemoEmail(user.email);

  const [{ data: rows }, { data: alerts }, { count: docCount }, { data: recent }, { data: fresh }] = await Promise.all([
    supabase.from("job_matches").select("status, found_at").limit(5000).returns<Pick<JobMatch, "status" | "found_at">[]>(),
    supabase.from("alerts").select("*").order("created_at", { ascending: false }).returns<Alert[]>(),
    supabase.from("documents").select("id", { count: "exact", head: true }),
    supabase
      .from("job_matches")
      .select("id, title, company, location, job_url, found_at, status")
      .order("found_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(6)
      .returns<Pick<JobMatch, "id" | "title" | "company" | "location" | "job_url" | "found_at" | "status">[]>(),
    supabase
      .from("job_matches")
      .select("id, alert_id, title, company, location, salary, site, is_remote, date_posted, found_at, job_url, description")
      .eq("status", "new")
      .order("found_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(40)
      .returns<Pick<JobMatch, "id" | "alert_id" | "title" | "company" | "location" | "salary" | "site" | "is_remote" | "date_posted" | "found_at" | "job_url" | "description">[]>(),
  ]);

  const jobs = rows ?? [];
  const now = Date.now();
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = now - (8 - i) * WEEK;
    return {
      start,
      label: new Date(start).toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
      value: 0,
    };
  });
  for (const j of jobs) {
    const t = new Date(j.found_at).getTime();
    const idx = Math.floor((t - (now - 8 * WEEK)) / WEEK);
    if (idx >= 0 && idx < 8) weeks[idx].value++;
  }
  const thisWeek = weeks[7].value;
  const lastWeek = weeks[6].value;
  const applied = jobs.filter((j) => APPLIED.has(j.status)).length;
  const interviewed = jobs.filter((j) => INTERVIEWED.has(j.status)).length;
  const responded = jobs.filter((j) => RESPONDED.has(j.status)).length;
  const offers = jobs.filter((j) => j.status === "offer").length;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const diff = thisWeek - lastWeek;

  const alertList = alerts ?? [];
  const roleById = new Map(alertList.map((a) => [a.id, a.role]));
  const snippetOf = (d: string | null) => {
    if (!d) return null;
    const clean = d.replace(/\\([\\`*_{}[\]()#+\-.!>|~])/g, "$1").replace(/[*_#>]+/g, "").replace(/\s+/g, " ").trim();
    return clean.length > 300 ? `${clean.slice(0, 300).replace(/\s+\S*$/, "")}…` : clean;
  };
  const deckJobs: DeckJob[] = (fresh ?? []).map((j) => ({
    id: j.id,
    title: j.title,
    company: j.company,
    location: j.location,
    salary: j.salary,
    site: j.site,
    is_remote: j.is_remote,
    date_posted: j.date_posted,
    found_at: j.found_at,
    job_url: j.job_url,
    snippet: snippetOf(j.description),
    alertRole: j.alert_id ? roleById.get(j.alert_id) ?? null : null,
  }));
  const activeAlerts = alertList.filter((a) => a.active);
  const hasChannel = Boolean(profile?.telegram_chat_id || profile?.discord_webhook_url);
  const checklist = [
    { done: alertList.length > 0, text: "Create your first alert", href: "/onboarding" },
    { done: hasChannel, text: "Connect Telegram or Discord (optional — email works already)", href: "/settings" },
    { done: (docCount ?? 0) > 0, text: "Upload your resume versions", href: "/documents" },
    { done: applied > 0, text: "Track your first application", href: "/jobs" },
  ];
  const checklistDone = checklist.every((c) => c.done);
  const firstName = (profile?.full_name ?? "").split(" ")[0];

  return (
    <>
      <Flash code={flash} />
      <div className="page-head">
        <div>
          <span className="eyebrow">Overview</span>
          <h1>{firstName ? `Hi ${firstName}.` : "Your job search at a glance"}</h1>
        </div>
        <div className="row">
          <Link className="btn btn-outline" href="/jobs/new">+ Add a job</Link>
          <Link className="btn btn-outline" href="/onboarding">+ New alert</Link>
        </div>
      </div>

      {alertList.length > 0 ? (
        <div className="panel deck-panel">
          <SwipeDeck jobs={deckJobs} demo={demo} />
        </div>
      ) : (
        <div className="panel deck-panel empty-state">
          <h2>Set up an alert to start finding jobs</h2>
          <p className="muted">Tell us a role and a city. Then hit “Find jobs now” and swipe through matches.</p>
          <Link className="btn btn-accent" href="/onboarding">Create my first alert</Link>
        </div>
      )}

      <div className="kpi-row stagger" style={{ marginTop: 20 }}>
        <StatTile
          label="Matches this week"
          value={thisWeek}
          delta={{ text: lastWeek || thisWeek ? `${diff >= 0 ? "+" : ""}${diff} vs last week` : "First week", good: diff === 0 ? null : diff > 0 }}
          trend={weeks.map((w) => w.value)}
        />
        <StatTile label="Applied" value={applied} note={`${offers} offer${offers === 1 ? "" : "s"}`} />
        <StatTile label="Interview rate" value={pct(interviewed, applied)} suffix="%" note={`${interviewed} of ${applied} applications`} />
        <StatTile label="Response rate" value={pct(responded, applied)} suffix="%" note="Any reply, yes or no" />
      </div>

      <div className="dash-grid" style={{ marginTop: 20 }}>
        <div className="stack">
          <div className="panel">
            <WeeklyColumns weeks={weeks} title="Matches per week" />
          </div>
          <div className="panel">
            <FunnelBars
              title="Where your applications stand"
              stages={[
                { label: "Matched", value: jobs.length },
                { label: "Applied", value: applied },
                { label: "Interviewing", value: interviewed },
                { label: "Offer", value: offers },
              ]}
            />
          </div>
          <div className="panel">
            <div className="row between" style={{ marginBottom: 6 }}>
              <span className="eyebrow">Latest matches</span>
              <Link className="linklike small" href="/jobs">Open job log →</Link>
            </div>
            {(recent ?? []).length === 0 ? (
              <p className="muted small empty">
                No matches yet. {activeAlerts.length ? "Your alerts are scanning — new roles show up here within about two hours." : "Create an alert to start."}
              </p>
            ) : (
              <ul className="recent-list">
                {(recent ?? []).map((j) => (
                  <li key={j.id}>
                    <div className="info">
                      <Link href={`/jobs/${j.id}`}><b>{j.title ?? hostOf(j.job_url)}</b></Link>
                      <span className="small muted">{[j.company, j.location].filter(Boolean).join(" · ")} · {timeAgo(j.found_at)}</span>
                    </div>
                    <StatusSelect id={j.id} status={j.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="stack">
          {!checklistDone && (
            <div className="panel">
              <span className="eyebrow">Getting started</span>
              <ul className="checklist">
                {checklist.map((c) => (
                  <li key={c.text} className={c.done ? "done" : undefined}>
                    <span className="check" aria-hidden="true">{c.done ? "✓" : ""}</span>
                    {c.done ? <span>{c.text}</span> : <Link href={c.href}>{c.text}</Link>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="panel">
            <div className="row between">
              <span className="eyebrow">Watching</span>
              <Link className="linklike small" href="/alerts">Manage →</Link>
            </div>
            {alertList.length === 0 ? (
              <p className="small muted" style={{ marginTop: 10 }}>
                Nothing yet. <Link className="linklike" href="/onboarding">Set up an alert</Link>.
              </p>
            ) : (
              <ul className="watch-list">
                {alertList.map((a) => (
                  <li key={a.id}>
                    <span className={`status ${a.active ? "" : "off"}`} aria-label={a.active ? "Watching" : "Paused"} />
                    <div className="info">
                      <b>{a.role}</b>
                      <span className="small muted">{placeLabel(a.city, a.country, a.work_mode)} · checked {timeAgo(a.last_checked_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// "Find jobs now" searches several alerts; give the server action room.
export const maxDuration = 60;
