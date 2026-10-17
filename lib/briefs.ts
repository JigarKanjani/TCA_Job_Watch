import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderBrief, type BriefJob } from "@/lib/brief";
import { siteOrigin } from "@/lib/deliver";
import { sendEmail } from "@/lib/notify";
import { formatLocal, nextWindowStart, safeZone, windowOpenAt } from "@/lib/schedule";

type BriefAlert = { id: string; role: string; country: string; channels: string[]; windows: string[]; timezone: string };

/**
 * After "Find jobs now": email a brief of the new finds if the user wants
 * briefs and gets email alerts. Inside one of their delivery windows it goes
 * out now; otherwise it waits for the next window in their timezone.
 * Returns a short status line for the UI, or null when nothing was sent.
 */
export async function briefAfterSearch(opts: {
  supabase: SupabaseClient;
  to: string | null;
  name: string | null;
  wantsBriefs: boolean;
  alerts: BriefAlert[];
  since: Date;
}): Promise<string | null> {
  const { supabase, to, alerts } = opts;
  const emailAlerts = alerts.filter((a) => a.channels.includes("email"));
  if (!to || !opts.wantsBriefs || !emailAlerts.length) return null;

  const { data } = await supabase
    .from("job_matches")
    .select("id, title, company, location, job_url, salary, alert_id, pay_hint")
    .in("alert_id", emailAlerts.map((a) => a.id))
    .gte("found_at", new Date(opts.since.getTime() - 5000).toISOString())
    .eq("status", "new")
    .order("found_at", { ascending: false })
    .limit(60);
  const byId = new Map(emailAlerts.map((a) => [a.id, a]));
  const jobs: BriefJob[] = (data ?? []).map((j) => ({
    ...(j as BriefJob),
    alert_role: byId.get(j.alert_id as string)?.role ?? null,
    country: byId.get(j.alert_id as string)?.country ?? null,
  }));
  if (!jobs.length) return null;
  const ids = jobs.map((j) => j.id);

  const now = new Date();
  const open = emailAlerts.find((a) => windowOpenAt(a.windows, safeZone(a.timezone), now));
  if (open) {
    const brief = renderBrief({
      name: opts.name,
      jobs,
      searchedAt: now,
      sentAt: now,
      timezone: open.timezone,
      windows: open.windows,
      site: await siteOrigin(),
    });
    const sent = await sendEmail(to, brief.subject, brief.html, brief.text);
    await supabase.rpc("queue_search_brief", { p_match_ids: ids, p_send_at: now.toISOString(), p_sent: sent.ok });
    return sent.ok ? "Brief emailed to you." : "We'll email you a brief shortly.";
  }

  // Outside every window: hold it for the soonest opening across their alerts.
  const next = emailAlerts
    .map((a) => ({ a, at: nextWindowStart(a.windows, safeZone(a.timezone), now) }))
    .filter((x): x is { a: BriefAlert; at: Date } => Boolean(x.at))
    .sort((x, y) => x.at.getTime() - y.at.getTime())[0];
  if (!next) return null;
  const { error } = await supabase.rpc("queue_search_brief", { p_match_ids: ids, p_send_at: next.at.toISOString(), p_sent: false });
  return error ? null : `Brief scheduled for ${formatLocal(next.at, safeZone(next.a.timezone))}, when your delivery hours start.`;
}
