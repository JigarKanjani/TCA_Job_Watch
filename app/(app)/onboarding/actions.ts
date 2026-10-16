"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { CHANNELS, COUNTRIES, FREQUENCIES, WINDOWS, WORK_MODES } from "@/lib/config";
import { entitlementsFor } from "@/lib/plans";
import { DISCORD_WEBHOOK_RE } from "@/lib/notify";

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

  const role = String(form.get("role") ?? "").trim();
  const city = String(form.get("city") ?? "").trim();
  const country = String(form.get("country") ?? "Canada");
  const workMode = String(form.get("work_mode") ?? "any");
  const frequency = String(form.get("frequency") ?? "instant");
  const timezone = String(form.get("timezone") ?? "America/Edmonton");
  const channels = form.getAll("channels").map(String);
  const windows = form.getAll("windows").map(String);
  const discordUrl = String(form.get("discord_webhook_url") ?? "").trim();
  const excludes = String(form.get("exclude_keywords") ?? "")
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

  const { error } = await supabase.from("alerts").insert({
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
  });
  if (error) {
    if (error.hint === "plan_limit" || /plan allows/i.test(error.message)) return { error: error.message };
    return { error: "Couldn't save the alert. Please try again." };
  }

  redirect("/dashboard?flash=alert_created");
}
