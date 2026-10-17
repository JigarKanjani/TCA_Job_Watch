import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { placeLabel, timeAgo } from "@/lib/format";
import type { Alert, JobMatch } from "@/lib/types";
import { Flash } from "@/components/Flash";
import { StatTile } from "@/components/charts/StatTile";
import { FunnelBars } from "@/components/charts/FunnelBars";
import { WeeklyColumns } from "@/components/charts/WeeklyColumns";
import { TriageLauncher, type DeckJob } from "@/components/Triage";
import { ApplyBoard, type BoardJob } from "@/components/ApplyBoard";
import { isDemoEmail } from "@/lib/demo";
import { payFor, payView } from "@/lib/pay/estimate";

export const metadata: Metadata = { title: "Overview" };

const APPLIED = new Set(["applied", "interviewing", "offer", "rejected", "withdrawn"]);
const INTERVIEWED = new Set(["interviewing", "offer"]);
const RESPONDED = new Set(["interviewing", "offer", "rejected"]);
const WEEK = 7 * 86400 * 1000;
const BOARD_COLS = "id, alert_id, title, company, location, salary, job_url, found_at, status, updated_at, pay_hint";
type BoardRow = Omit<BoardJob, "apply_by" | "pay"> & {
  alert_id: string | null;
  salary: string | null;
  status: string;
  updated_at: string;
  pay_hint: string | null;
  apply_by?: string | null;
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ flash?: string }> }) {
  const { flash } = await searchParams;
  const { supabase, profile, user } = await requireProfile();
  const demo = isDemoEmail(user.email);

  // The To apply / Maybe board. apply_by arrives with the triage migration;
  // until then the board loads without Super Apply timers.
  const boardQuery = (cols: string) =>
    supabase
      .from("job_matches")
      .select(cols)
      .in("status", ["saved", "maybe"])
      .order("updated_at", { ascending: false })
      .limit(120)
      .returns<BoardRow[]>();
  const loadBoard = async () => {
    const withTimers = await boardQuery(`${BOARD_COLS}, apply_by`);
    return withTimers.error ? (await boardQuery(BOARD_COLS)).data : withTimers.data;
  };

  const [{ data: rows }, { data: alerts }, { count: docCount }, { data: fresh, count: freshCount }, board, { count: archived }] = await Promise.all([
    supabase.from("job_matches").select("status, found_at").limit(5000).returns<Pick<JobMatch, "status" | "found_at">[]>(),
    supabase.from("alerts").select("*").order("created_at", { ascending: false }).returns<Alert[]>(),
    supabase.from("documents").select("id", { count: "exact", head: true }),
    supabase
      .from("job_matches")
      .select("id, alert_id, title, company, location, salary, site, is_remote, date_posted, found_at, job_url, description", { count: "exact" })
      .eq("status", "new")
      .order("found_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(40)
      .returns<Pick<JobMatch, "id" | "alert_id" | "title" | "company" | "location" | "salary" | "site" | "is_remote" | "date_posted" | "found_at" | "job_url" | "description">[]>(),
    loadBoard(),
    supabase.from("job_matches").select("id", { count: "exact", head: true }).eq("status", "not_interested"),
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
  const countryById = new Map(alertList.map((a) => [a.id, a.country]));
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
    pay: payView({ ...j, country: j.alert_id ? countryById.get(j.alert_id) : null }),
  }));
  const boardRows = board ?? [];
  const toBoard = (j: BoardRow): BoardJob => ({
    id: j.id, title: j.title, company: j.company, location: j.location,
    job_url: j.job_url, found_at: j.found_at, apply_by: j.apply_by ?? null,
    pay: payView({ ...j, country: j.alert_id ? countryById.get(j.alert_id) : null }),
  });
  // Super Apply first (most urgent timer on top), then To apply, then Maybe.
  const superJobs = boardRows
    .filter((j) => j.status === "saved" && j.apply_by)
    .sort((a, b) => new Date(a.apply_by!).getTime() - new Date(b.apply_by!).getTime())
    .map(toBoard);
  const toApply = boardRows.filter((j) => j.status === "saved" && !j.apply_by).map(toBoard);
  const maybe = boardRows.filter((j) => j.status === "maybe").map(toBoard);
  const showBoard = boardRows.length > 0 || (archived ?? 0) > 0;
  const pays = [...(fresh ?? []), ...boardRows]
    .map((j) => payFor({ ...j, country: j.alert_id ? countryById.get(j.alert_id) : null }))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const mids = pays.map((p) => (p.annual[0] + p.annual[1]) / 2).sort((a, b) => a - b);
  const typicalPay = mids.length ? mids[Math.floor(mids.length / 2)] : null;
  const postedCount = pays.filter((p) => p.kind === "posted").length;
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
        <TriageLauncher jobs={deckJobs} total={freshCount ?? deckJobs.length} demo={demo} loginStamp={user.last_sign_in_at ?? "session"} />
      ) : (
        <div className="panel deck-panel empty-state">
          <h2>Set up an alert to start finding jobs</h2>
          <p className="muted">Tell us a role and a city. Then hit “Find jobs now” and swipe through matches.</p>
          <Link className="btn btn-accent" href="/onboarding">Create my first alert</Link>
        </div>
      )}

      {showBoard && (
        <ApplyBoard
          superJobs={superJobs}
          toApply={toApply}
          maybe={maybe}
          counts={{ toApply: toApply.length, maybe: maybe.length }}
          archived={archived ?? 0}
        />
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
        {typicalPay ? (
          <StatTile
            label="Typical pay in your matches"
            value={Math.round(typicalPay / 1000)}
            prefix="$"
            suffix="k"
            note={`${postedCount} posted · ${pays.length - postedCount} est. · per year`}
          />
        ) : (
          <StatTile label="Response rate" value={pct(responded, applied)} suffix="%" note="Any reply, yes or no" />
        )}
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
