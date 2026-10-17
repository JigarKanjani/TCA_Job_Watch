import "server-only";
import nodemailer from "nodemailer";
import { APP_NAME } from "@/lib/config";
import { allow, keyOf, sleep } from "@/lib/ratelimit";

export type SendResult = { ok: true } | { ok: false; error: string };

const fail = (error: string): SendResult => ({ ok: false, error });

// ---------- Email (any SMTP server, e.g. a free Gmail account) ----------
export function emailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_USER && process.env.SMTP_PASS,
  );
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<SendResult> {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || "";
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  try {
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      // Anti-spam caps: a few dozen emails per address a day, and an app-wide
      // daily total under the SMTP provider's limit (shared with the worker).
      if (!(await allow("email_to_day", keyOf(to)))) return fail("Daily email limit for this address reached. It'll resume tomorrow.");
      if (!(await allow("smtp_day", "all"))) return fail("Today's email limit is reached. Email resumes tomorrow; Telegram and Discord still work.");
      const port = Number(process.env.SMTP_PORT || 465);
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transport.sendMail({
        from,
        to,
        subject,
        html,
        text,
        // Lets mail apps show an unsubscribe button that leads to the settings page.
        ...(site ? { list: { unsubscribe: { url: `${site}/alerts`, comment: "Pause alerts or change channels" } } } : {}),
      });
      return { ok: true };
    }
    return fail("Email sending isn't set up yet. Add the SMTP settings on Vercel.");
  } catch (e) {
    return fail(`Couldn't send the email: ${(e as Error).message}`);
  }
}

// ---------- Telegram ----------
export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

// Telegram allows about one message a second per chat (30/s overall); on a
// 429 it says how long to wait, so wait (up to 5 s) and try once more.
export async function sendTelegram(chatId: string, text: string, retried = false): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return fail("Telegram isn't set up yet. Add TELEGRAM_BOT_TOKEN on Vercel.");
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000),
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { description?: string; parameters?: { retry_after?: number } };
      const wait = body.parameters?.retry_after;
      if (res.status === 429 && !retried && wait && wait <= 5) {
        await sleep(wait * 1000 + 250);
        return sendTelegram(chatId, text, true);
      }
      return fail(`Telegram said: ${body.description ?? res.statusText}`);
    }
    return { ok: true };
  } catch (e) {
    return fail(`Couldn't reach Telegram: ${(e as Error).message}`);
  }
}

// ---------- Discord (channel webhook) ----------
export const DISCORD_WEBHOOK_RE =
  /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/;

// Discord webhooks take about 5 requests per 2 seconds; a 429 carries
// retry_after (seconds), so wait (up to 5 s) and try once more.
export async function sendDiscord(webhookUrl: string, content: string, retried = false): Promise<SendResult> {
  if (!DISCORD_WEBHOOK_RE.test(webhookUrl)) return fail("That doesn't look like a Discord webhook URL.");
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: APP_NAME, content: content.slice(0, 1990) }),
    });
    if (res.status === 429 && !retried) {
      const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
      const wait = Number(body.retry_after ?? res.headers.get("retry-after") ?? 0);
      if (wait > 0 && wait <= 5) {
        await sleep(wait * 1000 + 250);
        return sendDiscord(webhookUrl, content, true);
      }
    }
    if (!res.ok) return fail(`Discord rejected the message (${res.status}). Check the webhook still exists.`);
    return { ok: true };
  } catch (e) {
    return fail(`Couldn't reach Discord: ${(e as Error).message}`);
  }
}
