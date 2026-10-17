import "server-only";
import { headers } from "next/headers";
import { APP_NAME } from "@/lib/config";
import { sendDiscord, sendEmail, sendTelegram } from "@/lib/notify";

// Sends a batch of matches the same way the scheduled worker does
// (worker/run_alerts.py — keep the wording in sync).

export type DeliverJob = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  salary: string | null;
  job_url: string;
  /** Posted pay, or an estimate ending in "(est.)". */
  pay?: string | null;
};

type AlertInfo = { role: string; frequency: string };
type Recipient = { email: string | null; telegram_chat_id: string | null; discord_webhook_url: string | null };

export async function siteOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const bits = (m: DeliverJob) => [m.company, m.location, m.pay ?? m.salary].filter(Boolean).join(" · ");
const EST_NOTE = "(est.) = market estimate for similar roles in the area (Job Bank / U.S. BLS), not from the employer. Actual pay can vary a lot.";
const hasEstimate = (jobs: DeliverJob[]) => jobs.some((m) => m.pay?.endsWith("(est.)"));

function header(alert: AlertInfo, n: number) {
  const s = n === 1 ? "" : "s";
  if (alert.frequency === "daily") return `☀️ Your daily ${APP_NAME} digest — ${n} new “${alert.role}” role${s}`;
  if (alert.frequency === "weekly") return `🗓️ Your weekly ${APP_NAME} digest — ${n} new “${alert.role}” role${s}`;
  return `🔔 ${n} new “${alert.role}” match${n === 1 ? "" : "es"}`;
}

function line(m: DeliverJob, site: string, rich = false) {
  const track = site ? `${site}/jobs/${m.id}` : "";
  if (rich) return `**${m.title ?? "New role"}**\n${bits(m)}\nApply: <${m.job_url}>${track ? `\nTrack it: <${track}>` : ""}`;
  return `🆕 ${m.title ?? "New role"}\n${bits(m) ? `${bits(m)}\n` : ""}Apply: ${m.job_url}${track ? `\nTrack it: ${track}` : ""}`;
}

function chunks(parts: string[], limit: number) {
  const out: string[] = [];
  let buf = "";
  for (const p of parts) {
    if (buf && buf.length + p.length + 2 > limit) {
      out.push(buf.trim());
      buf = "";
    }
    buf += `${p}\n\n`;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function emailHtml(alert: AlertInfo, jobs: DeliverJob[], site: string, note?: string) {
  const rows = jobs
    .map((m) => {
      const track = site ? `&nbsp;&nbsp;<a href="${esc(site)}/jobs/${m.id}" style="color:#a8402f">Track it</a>` : "";
      return (
        `<tr><td style="padding:14px 0;border-top:1px solid #efe4dd">` +
        `<a href="${esc(m.job_url)}" style="color:#111827;font-weight:600;font-size:16px;text-decoration:none">${esc(m.title ?? "New role")}</a>` +
        `<div style="color:#4b5563;font-size:14px;margin:4px 0 8px">${esc(bits(m))}</div>` +
        `<a href="${esc(m.job_url)}" style="background:#db624d;color:#fff;padding:7px 13px;border-radius:999px;text-decoration:none;font-size:13px;font-weight:600">Apply now</a>${track}</td></tr>`
      );
    })
    .join("");
  const sort = site
    ? `<p style="margin:18px 0 0"><a href="${esc(site)}/dashboard" style="color:#a8402f;font-weight:600">Sort them on your dashboard →</a></p>`
    : "";
  return (
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:600px;margin:auto;padding:20px;color:#111827">` +
    `<h2 style="font-size:20px;margin:0 0 6px">${esc(header(alert, jobs.length))}</h2>` +
    (note ? `<p style="color:#4b5563;font-size:14px;margin:0 0 8px">${esc(note)}</p>` : "") +
    `<table style="width:100%;border-collapse:collapse">${rows}</table>${sort}` +
    (hasEstimate(jobs) ? `<p style="color:#7a8a8f;font-size:11px;margin-top:18px">${esc(EST_NOTE)}</p>` : "") +
    `</div>`
  );
}

/** Returns which channels accepted the message. */
export async function deliverMatches(opts: {
  alert: AlertInfo;
  jobs: DeliverJob[];
  channels: string[];
  to: Recipient;
  site: string;
  note?: string;
}): Promise<Record<string, boolean>> {
  const { alert, jobs, channels, to, site, note } = opts;
  const results: Record<string, boolean> = {};
  if (!jobs.length) return results;
  const head = header(alert, jobs.length);
  await Promise.all(
    channels.map(async (ch) => {
      if (ch === "email" && to.email) {
        const subject =
          jobs.length === 1
            ? `New role: ${jobs[0].title ?? alert.role}${jobs[0].company ? ` at ${jobs[0].company}` : ""}`
            : head.split(" ").slice(1).join(" ");
        const text = [head, ...(note ? [note] : []), ...jobs.map((m) => line(m, site)), ...(hasEstimate(jobs) ? [EST_NOTE] : [])].join("\n\n");
        results.email = (await sendEmail(to.email, subject, emailHtml(alert, jobs, site, note), text)).ok;
      }
      if (ch === "telegram" && to.telegram_chat_id) {
        let ok = true;
        for (const text of chunks([head, ...(note ? [note] : []), ...jobs.map((m) => line(m, site)), ...(hasEstimate(jobs) ? [EST_NOTE] : [])], 3800)) {
          ok = (await sendTelegram(to.telegram_chat_id, text)).ok && ok;
        }
        results.telegram = ok;
      }
      if (ch === "discord" && to.discord_webhook_url) {
        let ok = true;
        for (const text of chunks([`**${head}**`, ...(note ? [note] : []), ...jobs.map((m) => line(m, site, true)), ...(hasEstimate(jobs) ? [`-# ${EST_NOTE}`] : [])], 1900)) {
          ok = (await sendDiscord(to.discord_webhook_url, text)).ok && ok;
        }
        results.discord = ok;
      }
    }),
  );
  return results;
}
