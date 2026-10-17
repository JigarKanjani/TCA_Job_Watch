"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireUser } from "@/lib/auth";
import { briefAfterSearch } from "@/lib/briefs";
import { DEMO_MESSAGE, isDemoEmail } from "@/lib/demo";
import { searchLinkedIn } from "@/lib/linkedin";
import { matchesAlert } from "@/lib/matching";
import { allow, LIMITED } from "@/lib/ratelimit";
import { isUuid } from "@/lib/sanitize";
import type { Alert } from "@/lib/types";

export type FindState = { ok: boolean; found?: number; searched?: number; message: string };

const COOLDOWN_MS = 2 * 60 * 1000;

// "Find jobs now": search LinkedIn for every active alert right away and drop
// new matches straight into the log (and the swipe deck).
export async function findJobsNow(): Promise<FindState> {
  const { supabase, user, profile } = await requireProfile();
  if (isDemoEmail(user.email)) return { ok: false, message: DEMO_MESSAGE };
  const startedAt = new Date();

  const { data: alerts } = await supabase
    .from("alerts")
    .select("id, role, city, country, work_mode, min_salary, exclude_keywords, last_checked_at, channels, windows, timezone")
    .eq("active", true)
    .returns<
      Pick<Alert, "id" | "role" | "city" | "country" | "work_mode" | "min_salary" | "exclude_keywords" | "last_checked_at" | "channels" | "windows" | "timezone">[]
    >();
  if (!alerts?.length) return { ok: false, message: "Create an alert first, then we can search for you." };

  const now = Date.now();
  const due = alerts.filter((a) => !a.last_checked_at || now - new Date(a.last_checked_at).getTime() > COOLDOWN_MS);
  if (!due.length) return { ok: true, found: 0, searched: 0, message: "We just searched — give it a couple of minutes before searching again." };
  if (!(await allow("find_now", user.id))) return { ok: false, found: 0, searched: 0, message: LIMITED };

  const { data: known } = await supabase.from("job_matches").select("job_url").limit(5000);
  const seen = new Set((known ?? []).map((r) => r.job_url as string));

  let found = 0;
  let blocked = 0;
  // At most 3 alerts searched at once, to stay under LinkedIn's burst limits.
  const queue = due.slice(0, 10);
  const runOne = async (a: (typeof queue)[number]) => {
    // Look back further on the first search so a brand-new alert fills up.
    const hoursOld = a.last_checked_at ? 72 : 168;
    const res = await searchLinkedIn({ role: a.role, city: a.city, country: a.country, workMode: a.work_mode, hoursOld });
    if (res.blocked) blocked++;
    const keep = res.jobs.filter((j) => matchesAlert(a, j, seen)).slice(0, 40);
    keep.forEach((j) => seen.add(j.job_url));
    if (!keep.length) return;
    const { data, error } = await supabase.rpc("save_found_jobs", { p_alert_id: a.id, p_jobs: keep });
    if (!error && typeof data === "number") found += data;
  };
  await Promise.all(
    Array.from({ length: Math.min(3, queue.length) }, async () => {
      for (let a = queue.shift(); a; a = queue.shift()) await runOne(a);
    }),
  );

  revalidatePath("/dashboard");
  revalidatePath("/jobs");
  // Email a short brief of the finds, inside the user's delivery hours.
  const brief = found
    ? await briefAfterSearch({
        supabase,
        to: profile?.email ?? user.email ?? null,
        name: profile?.full_name ?? null,
        wantsBriefs: profile?.search_briefs ?? true,
        alerts: due.map((a) => ({ id: a.id, role: a.role, country: a.country, channels: a.channels, windows: a.windows, timezone: a.timezone })),
        since: startedAt,
      }).catch(() => null)
    : null;
  if (found === 0 && blocked === due.length) {
    return { ok: false, found: 0, searched: due.length, message: "LinkedIn is busy right now. Try again in a minute — your scheduled scan will also catch up." };
  }
  return {
    ok: true,
    found,
    searched: due.length,
    message: found
      ? `Found ${found} new job${found === 1 ? "" : "s"} across ${due.length} alert${due.length === 1 ? "" : "s"}.${brief ? ` ${brief}` : ""}`
      : "No new matches since your last search. We'll keep watching.",
  };
}

export type SwipeResult = { ok: boolean; demo?: boolean; message?: string };

// Swipe/triage decisions and the dashboard's quick moves:
//   apply → "To apply" (saved)      super → To apply + a 24-hour apply-by timer
//   maybe → Maybe pile              discard → Not interested (archived)
//   applied → Applied               unsuper → drop the timer, stay in To apply
//   undo → back to New (redo the decision)
export type Move = "apply" | "super" | "maybe" | "discard" | "applied" | "unsuper" | "undo";

const DAY_MS = 24 * 60 * 60 * 1000;
const SCHEMA_MISSING = new Set(["PGRST204", "42703", "23514"]);
const NEEDS_UPDATE = "Super Apply and Maybe need a one-time database update (see the README). Everything else works.";

export async function moveJob(id: string, move: Move): Promise<SwipeResult> {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) return { ok: false, demo: true, message: DEMO_MESSAGE };
  if (!isUuid(id)) return { ok: false, message: "Unknown job." };
  if (!(await allow("writes", user.id))) return { ok: false, message: LIMITED };

  const patch: Record<string, unknown> = {};
  if (move === "apply") Object.assign(patch, { status: "saved", apply_by: null });
  if (move === "super") Object.assign(patch, { status: "saved", apply_by: new Date(Date.now() + DAY_MS).toISOString() });
  if (move === "unsuper") Object.assign(patch, { apply_by: null });
  if (move === "maybe") Object.assign(patch, { status: "maybe", apply_by: null });
  if (move === "discard") Object.assign(patch, { status: "not_interested", apply_by: null });
  if (move === "undo") Object.assign(patch, { status: "new", apply_by: null });
  if (move === "applied") {
    patch.status = "applied";
    const { data } = await supabase.from("job_matches").select("applied_at").eq("id", id).single();
    if (!data?.applied_at) patch.applied_at = new Date().toISOString().slice(0, 10);
  }
  if (!Object.keys(patch).length) return { ok: false, message: "Unknown action." };

  let { error } = await supabase.from("job_matches").update(patch).eq("id", id);
  // Before the triage migration runs there is no apply_by column or Maybe
  // stage; plain moves still work without the timer.
  if (error && SCHEMA_MISSING.has(error.code ?? "")) {
    if (move === "super" || move === "maybe" || move === "unsuper") return { ok: false, message: NEEDS_UPDATE };
    delete patch.apply_by;
    ({ error } = await supabase.from("job_matches").update(patch).eq("id", id));
  }
  if (error) return { ok: false, message: "Couldn't save that. Please try again." };
  return { ok: true };
}

export async function refreshDashboard() {
  revalidatePath("/dashboard");
  revalidatePath("/jobs");
}
