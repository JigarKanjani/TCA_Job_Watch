"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { CHANNELS, COUNTRIES, FREQUENCIES, WINDOWS, WORK_MODES } from "@/lib/config";
import { entitlementsFor } from "@/lib/plans";
import { DISCORD_WEBHOOK_RE } from "@/lib/notify";
import { DEMO_MESSAGE, isDemoEmail } from "@/lib/demo";
import { searchLinkedIn } from "@/lib/linkedin";
import { matchesAlert } from "@/lib/matching";
import { deliverMatches, siteOrigin, type DeliverJob } from "@/lib/deliver";
import { estimatePay, payView } from "@/lib/pay/estimate";
import { formatRange, money } from "@/lib/pay/parse";
import { windowOpenAt } from "@/lib/schedule";
import { allow, LIMITED } from "@/lib/ratelimit";
import { cleanText } from "@/lib/sanitize";

export type CreateAlertState = { error?: string };

const inList = (list: readonly { value: string }[], v: string) => list.some((x) => x.value === v);

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function intOrNull(v: FormDataEntryValue | null, min: number, max: number): number | null | "bad" {
  const s = String(v ?? "").replace(/[,$\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < min || n > max) return "bad";
  return n;
}

export async function createAlert(_prev: CreateAlertState, form: FormData): Promise<CreateAlertState> {
  const { supabase, user, profile } = await requireProfile();
  const ent = entitlementsFor(profile?.plan);
  if (isDemoEmail(user.email)) return { error: DEMO_MESSAGE };
  if (!(await allow("create_alert", user.id))) return { error: LIMITED };

  const role = cleanText(form.get("role"), 101);
  const city = cleanText(form.get("city"), 101);
  const country = cleanText(form.get("country"), 20) || "Canada";
  const workMode = cleanText(form.get("work_mode"), 20) || "any";
  const frequency = cleanText(form.get("frequency"), 20) || "instant";
  const timezone = cleanText(form.get("timezone"), 64) || "America/Edmonton";
  const channels = [...new Set(form.getAll("channels").map((v) => cleanText(v, 20)))].slice(0, 5);
  const windows = [...new Set(form.getAll("windows").map((v) => cleanText(v, 20)))].slice(0, 10);
  const discordUrl = cleanText(form.get("discord_webhook_url"), 300);
  const excludes = cleanText(form.get("exclude_keywords"), 2000)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 25)
    .map((s) => s.slice(0, 40));
  const minSalary = intOrNull(form.get("min_salary"), 0, 1_000_000);
  const maxExperience = intOrNull(form.get("max_experience"), 0, 50);

  if (role.length < 2 || role.length > 100) return { error: "Enter a role between 2 and 100 characters." };
  if (city.length > 100) return { error: "That city name is too long." };
  if (!(COUNTRIES as readonly string[]).includes(country)) return { error: "Pick Canada or USA." };
  if (!inList(WORK_MODES, workMode)) return { error: "Pick a work style." };
  if (!inList(FREQUENCIES, frequency)) return { error: "Pick how often you want alerts." };
  if (frequency === "instant" && !ent.instantAlerts) return { error: "Instant alerts are part of Pro. Pick a daily or weekly digest." };
  if (windows.length === 0 || !windows.every((w) => inList(WINDOWS, w))) return { error: "Pick at least one delivery window." };
  if (windows.includes("always") && !ent.aroundTheClock) return { error: "24/7 delivery is part of Pro." };
  if (channels.length === 0 || !channels.every((c) => inList(CHANNELS, c))) return { error: "Pick at least one place to send alerts." };
  if (!validTimezone(timezone)) return { error: "That timezone isn't recognised." };
  if (minSalary === "bad") return { error: "Enter the minimum salary as a whole number, like 65000." };
  if (maxExperience === "bad") return { error: "Enter years of experience as a number from 0 to 50." };

  if (channels.includes("discord")) {
    if (discordUrl) {
      if (!DISCORD_WEBHOOK_RE.test(discordUrl)) return { error: "That Discord webhook URL doesn't look right. It starts with https://discord.com/api/webhooks/" };
      const { error } = await supabase.from("profiles").update({ discord_webhook_url: discordUrl }).eq("id", user.id);
      if (error) return { error: "Couldn't save your Discord webhook. Try again." };
    } else if (!profile?.discord_webhook_url) {
      return { error: "Paste your Discord channel webhook, or untick Discord." };
    }
  }

  const { data: created, error } = await supabase.from("alerts").insert({
    user_id: user.id,
    role,
    city,
    country,
    work_mode: workMode,
    min_salary: minSalary,
    max_experience: maxExperience,
    exclude_keywords: excludes,
    frequency,
    channels,
    windows: windows.includes("always") ? ["always"] : windows,
    timezone,
  }).select("id").single();
  if (error || !created) {
    if (error?.hint === "plan_limit" || /plan allows/i.test(error?.message ?? "")) return { error: error!.message };
    return { error: "Couldn't save the alert. Please try again." };
  }

  // Search right away so the dashboard fills up now, and send an instant
  // alert's first batch immediately. Daily/weekly batches wait for the digest.
  let found = 0;
  try {
    const res = await searchLinkedIn({ role, city, country, workMode, hoursOld: 168 });
    const { data: known } = await supabase.from("job_matches").select("job_url").limit(5000);
    const seen = new Set((known ?? []).map((r) => r.job_url as string));
    const keep = res.jobs
      .filter((j) => matchesAlert({ city, work_mode: workMode, min_salary: minSalary, exclude_keywords: excludes }, j, seen))
      .slice(0, 40);
    if (keep.length) {
      let queued = true;
      let saved = await supabase.rpc("queue_found_jobs", { p_alert_id: created.id, p_jobs: keep });
      if (saved.error) {
        // Fallback: save_found_jobs marks them as already seen.
        queued = false;
        saved = await supabase.rpc("save_found_jobs", { p_alert_id: created.id, p_jobs: keep });
      }
      found = typeof saved.data === "number" ? saved.data : 0;
      // Instant alerts send the first batch now if a delivery window is open;
      // otherwise it stays queued and the worker sends it when one opens.
      if (found && frequency === "instant" && windowOpenAt(windows.includes("always") ? ["always"] : windows, timezone, new Date())) {
        const { data: batch } = await supabase
          .from("job_matches")
          .select("id, title, company, location, salary, job_url, pay_hint")
          .eq("alert_id", created.id)
          .order("found_at", { ascending: false })
          .limit(25)
          .returns<(DeliverJob & { pay_hint: string | null })[]>();
        for (const j of batch ?? []) {
          const p = payView({ ...j, country });
          j.pay = p ? `${p.text}${p.kind === "estimate" ? " (est.)" : ""}` : null;
        }
        const sent = await deliverMatches({
          alert: { role, frequency },
          jobs: batch ?? [],
          channels,
          to: {
            email: profile?.email ?? user.email ?? null,
            telegram_chat_id: profile?.telegram_chat_id ?? null,
            discord_webhook_url: discordUrl || profile?.discord_webhook_url || null,
          },
          site: await siteOrigin(),
          note: "Here's your first batch. From now on, new matches arrive as they're found, during the hours you picked.",
        });
        if (queued && Object.values(sent).some(Boolean)) {
          await supabase.rpc("mark_alert_delivered", { p_alert_id: created.id, p_match_ids: (batch ?? []).map((b) => b.id) });
        }
      }
    }
  } catch {
    // The scheduled scan picks it up within the hour.
  }

  redirect(`/dashboard?flash=${found ? "alert_created_found" : "alert_created"}`);
}

export type TypicalPay = { range: string; median: string; floor: number; note: string } | null;

/** Typical pay for a role and city, shown while setting the salary floor. */
export async function typicalPay(role: string, city: string, country: string): Promise<TypicalPay> {
  const { user } = await requireProfile();
  if (!(await allow("typical_pay", user.id))) return null;
  const e = estimatePay(cleanText(role, 100), cleanText(city, 100), country === "USA" ? "US" : "CA");
  if (!e) return null;
  return {
    range: formatRange(e.min, e.max),
    median: money(e.median),
    floor: e.min,
    note: `Est. for ${/^[A-Z][a-z]/.test(e.occupation) ? e.occupation.charAt(0).toLowerCase() + e.occupation.slice(1) : e.occupation} in ${e.place} (${e.source})`,
  };
}
