import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { STATUSES, labelFor } from "@/lib/config";
import { hostOf, shortDate } from "@/lib/format";
import type { Alert, DocumentRow, JobMatch } from "@/lib/types";
import { Flash } from "@/components/Flash";
import { StatusSelect } from "@/components/StatusSelect";
import { FindJobsButton } from "@/components/FindJobsButton";
import { PayFinePrint, PayTag } from "@/components/PayTag";
import { payView } from "@/lib/pay/estimate";

export const metadata: Metadata = { title: "Job log" };

type Search = { status?: string; alert?: string; q?: string; flash?: string };

export default async function JobsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { supabase } = await requireUser();

  let query = supabase
    .from("job_matches")
    .select("id, alert_id, job_url, title, company, location, site, salary, found_at, notified_at, status, applied_at, resume_doc_id, source, pay_hint")
    .order("found_at", { ascending: false })
      .order("id", { ascending: true })
    .limit(200);
  const archive = params.status === "not_interested";
  if (params.status && STATUSES.some((s) => s.value === params.status)) query = query.eq("status", params.status);
  // Jobs you passed on live in the archive, not the main log.
  else query = query.neq("status", "not_interested");
  if (params.alert) query = query.eq("alert_id", params.alert);
  if (params.q) {
    const q = params.q.replace(/[%,()]/g, " ").trim().slice(0, 80);
    if (q) query = query.or(`title.ilike.%${q}%,company.ilike.%${q}%,location.ilike.%${q}%`);
  }

  const [{ data: jobs }, { data: alerts }, { data: docs }, { count: archivedCount }] = await Promise.all([
    query.returns<JobMatch[]>(),
    supabase.from("alerts").select("id, role, country").returns<Pick<Alert, "id" | "role" | "country">[]>(),
    supabase.from("documents").select("id, name").returns<Pick<DocumentRow, "id" | "name">[]>(),
    supabase.from("job_matches").select("id", { count: "exact", head: true }).eq("status", "not_interested"),
  ]);
  const alertName = new Map((alerts ?? []).map((a) => [a.id, a.role]));
  const docName = new Map((docs ?? []).map((d) => [d.id, d.name]));
  const alertCountry = new Map((alerts ?? []).map((a) => [a.id, a.country]));
  const list = (jobs ?? []).map((j) => ({ ...j, pay: payView({ ...j, country: j.alert_id ? alertCountry.get(j.alert_id) : null }) }));
  const filtered = Boolean(params.status || params.alert || params.q);

  return (
    <>
      <Flash code={params.flash} />
      <div className="page-head">
        <div>
          <span className="eyebrow">{archive ? "Jobs you passed on" : "Every job you've been sent or saved"}</span>
          <h1>{archive ? "Archive" : "Job log"}</h1>
          {archive && <p className="muted small">Changed your mind? Set a job&apos;s stage back to To apply or Maybe.</p>}
        </div>
        <div className="row">
          <FindJobsButton className="btn btn-outline" compact />
          <Link className="btn btn-accent" href="/jobs/new">+ Add a job by link</Link>
        </div>
      </div>

      <form className="filters" method="get">
        <input className="input" name="q" defaultValue={params.q ?? ""} placeholder="Search title, company, place" aria-label="Search" />
        <select className="input" name="status" defaultValue={params.status ?? ""} aria-label="Stage">
          <option value="">All stages (except archive)</option>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className="input" name="alert" defaultValue={params.alert ?? ""} aria-label="Alert">
          <option value="">All alerts</option>
          {(alerts ?? []).map((a) => <option key={a.id} value={a.id}>{a.role}</option>)}
        </select>
        <button className="btn btn-dark btn-sm" type="submit">Filter</button>
        {filtered && <Link className="btn btn-ghost btn-sm" href="/jobs">Clear</Link>}
        {!archive && (
          <Link className="btn btn-ghost btn-sm archive-link" href="/jobs?status=not_interested">
            🗄 Archive ({archivedCount ?? 0})
          </Link>
        )}
      </form>

      {list.length === 0 ? (
        <div className="panel empty-state">
          <h2>{archive ? "The archive is empty" : filtered ? "Nothing matches those filters" : "Your log is empty — for now"}</h2>
          <p className="muted">
            {archive
              ? "Jobs you mark Not interested (swipe left) land here."
              : filtered
              ? "Try a different stage or clear the filters."
              : "Jobs we send you land here automatically. You can also add any job by pasting its link."}
          </p>
          {!filtered && <Link className="btn btn-accent" href="/jobs/new">Add a job by link</Link>}
        </div>
      ) : (
        <div className="panel table-wrap" style={{ padding: 0 }}>
          <table className="jobs">
            <thead>
              <tr>
                <th>Role</th>
                <th>Where</th>
                <th>Found</th>
                <th>Stage</th>
                <th>Resume used</th>
              </tr>
            </thead>
            <tbody>
              {list.map((j) => (
                <tr key={j.id}>
                  <td>
                    <Link href={`/jobs/${j.id}`}>{j.title ?? hostOf(j.job_url)}</Link>
                    <div className="small muted">
                      {j.company ?? "—"}
                      {j.alert_id && alertName.get(j.alert_id) ? ` · via “${alertName.get(j.alert_id)}”` : j.source === "manual" ? " · added by you" : ""}
                    </div>
                  </td>
                  <td className="small">{j.location ?? "—"}{j.pay && <div><PayTag pay={j.pay} className="pay-inline" /></div>}</td>
                  <td className="small nowrap">{shortDate(j.found_at)}{j.notified_at ? <div className="muted">sent</div> : j.source === "alert" ? <div className="muted">queued</div> : null}</td>
                  <td><StatusSelect id={j.id} status={j.status} /></td>
                  <td className="small">{j.resume_doc_id ? docName.get(j.resume_doc_id) ?? "—" : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.some((j) => j.pay?.kind === "estimate") && <PayFinePrint className="pay-fine-block" />}
      {list.length === 200 && <p className="hint" style={{ marginTop: 10 }}>Showing the 200 most recent. Use the filters to narrow it down.</p>}
      <p className="hint" style={{ marginTop: 10 }}>Stages: {STATUSES.map((s) => labelFor(STATUSES, s.value)).join(" → ")}</p>
    </>
  );
}
