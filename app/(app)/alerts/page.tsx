import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { CHANNELS, FREQUENCIES, WINDOWS, labelFor } from "@/lib/config";
import { placeLabel, timeAgo } from "@/lib/format";
import type { Alert } from "@/lib/types";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { deleteAlert, setAlertActive } from "./actions";

export const metadata: Metadata = { title: "Alerts" };

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ flash?: string }> }) {
  const { flash } = await searchParams;
  const { supabase } = await requireUser();
  const [{ data: alerts }, { data: limit }, { data: counts }] = await Promise.all([
    supabase.from("alerts").select("*").order("created_at", { ascending: false }).returns<Alert[]>(),
    supabase.rpc("my_alert_limit"),
    supabase.from("job_matches").select("alert_id").not("alert_id", "is", null),
  ]);
  const list = alerts ?? [];
  const max = typeof limit === "number" ? limit : 10;
  const perAlert = new Map<string, number>();
  for (const r of counts ?? []) perAlert.set(r.alert_id as string, (perAlert.get(r.alert_id as string) ?? 0) + 1);

  return (
    <>
      <Flash code={flash} />
      <div className="page-head">
        <div>
          <span className="eyebrow">{list.length} of {max} alerts used</span>
          <h1>Your alerts</h1>
        </div>
        {list.length < max && <Link className="btn btn-accent" href="/onboarding">+ Watch another role</Link>}
      </div>

      {list.length === 0 ? (
        <div className="panel empty-state">
          <h2>No alerts yet</h2>
          <p className="muted">Tell us a role and a city, and we&apos;ll start watching.</p>
          <Link className="btn btn-accent" href="/onboarding">Set up your first alert</Link>
        </div>
      ) : (
        <div className="stack stagger">
          {list.map((a) => (
            <div key={a.id} className="card alert-row">
              <div className="row between">
                <h3>{a.role}</h3>
                <span className={`status ${a.active ? "" : "off"}`}>{a.active ? "Watching" : "Paused"}</span>
              </div>
              <p className="muted small">{placeLabel(a.city, a.country, a.work_mode)}</p>
              <div className="meta">
                <span className="tag">{labelFor(FREQUENCIES, a.frequency)}</span>
                {a.windows.map((w) => <span key={w} className="tag tag-muted">{labelFor(WINDOWS, w)}</span>)}
                {a.channels.map((c) => <span key={c} className="tag tag-muted">{labelFor(CHANNELS, c)}</span>)}
                {a.min_salary ? <span className="tag tag-muted">${a.min_salary.toLocaleString()}+</span> : null}
                {a.max_experience != null ? <span className="tag tag-muted">≤ {a.max_experience} yrs</span> : null}
              </div>
              <div className="row between small muted">
                <span>{perAlert.get(a.id) ?? 0} matches · last checked {timeAgo(a.last_checked_at)}</span>
                <div className="row">
                  <form action={setAlertActive}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="active" value={String(!a.active)} />
                    <SubmitButton className="btn btn-outline btn-sm" pendingText="…">{a.active ? "Pause" : "Resume"}</SubmitButton>
                  </form>
                  <form action={deleteAlert}>
                    <input type="hidden" name="id" value={a.id} />
                    <SubmitButton className="btn btn-danger btn-sm" pendingText="…">Delete</SubmitButton>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
