import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAnonClient } from "@/lib/supabase/anon";

// Rate limits shared by every server instance and the alert worker, counted
// in Postgres (public.rate_limit_hit — a fixed window per bucket and key).
// Keys are a user id, a hashed IP, a hashed email address or "all" for an
// app-wide budget. Raw IPs and addresses are never stored.
//
// Windows are in seconds. Keep smtp_day / email_to_day in sync with
// worker/run_alerts.py, which counts against the same buckets.
export const RULES = {
  // Per signed-in user
  find_now: { limit: 8, window: 3600 },
  create_alert: { limit: 12, window: 3600 },
  add_job: { limit: 60, window: 3600 },
  fetch_jd: { limit: 40, window: 3600 },
  kit: { limit: 150, window: 3600 },
  email_finder: { limit: 25, window: 3600 },
  send_test: { limit: 6, window: 3600 },
  typical_pay: { limit: 120, window: 3600 },
  export: { limit: 10, window: 3600 },
  delete_data: { limit: 10, window: 3600 },
  writes: { limit: 900, window: 3600 },
  // Per IP
  pay_api: { limit: 300, window: 3600 },
  demo_login: { limit: 15, window: 900 },
  // Per Telegram chat
  telegram_in: { limit: 30, window: 60 },
  // App-wide budgets for the free services we call
  linkedin: { limit: 240, window: 3600 },
  jina: { limit: 15, window: 60 }, // keyless Jina Reader allows 20 a minute
  clearbit: { limit: 300, window: 3600 },
  dns: { limit: 600, window: 3600 },
  site_fetch: { limit: 600, window: 3600 },
  // Email: a free Gmail account sends about 500 a day
  smtp_day: { limit: 450, window: 86400 },
  email_to_day: { limit: 30, window: 86400 },
} as const;

export type Bucket = keyof typeof RULES;

export const LIMITED = "You're doing that a lot. Please wait a few minutes and try again.";

/** Hash something personal (an IP, an email) into a stable, non-reversible key. */
export function keyOf(value: string): string {
  return createHash("sha256")
    .update(`${value.trim().toLowerCase()}|${process.env.WORKER_SECRET ?? ""}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Count one hit and say whether it's within the limit. Fails open: if the
 * limiter can't be reached (or isn't configured locally) nothing is blocked,
 * and the database guards still cap bulk writes.
 */
export async function allow(bucket: Bucket, key: string): Promise<boolean> {
  const secret = process.env.WORKER_SECRET;
  if (!secret) return true;
  const { limit, window } = RULES[bucket];
  try {
    const { data, error } = await createAnonClient().rpc("rate_limit_hit", {
      p_secret: secret,
      p_bucket: bucket,
      p_key: key.slice(0, 128),
      p_limit: limit,
      p_window_seconds: window,
    });
    return error ? true : data !== false;
  } catch {
    return true;
  }
}

/** The caller's IP as Vercel reports it (it overwrites client-sent values), hashed. */
export function ipKeyFrom(h: Headers): string {
  const raw = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  return keyOf(raw);
}

export async function ipKey(): Promise<string> {
  return ipKeyFrom(await headers());
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
