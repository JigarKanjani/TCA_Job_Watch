import "server-only";
import nodemailer from "nodemailer";
import { APP_NAME } from "@/lib/config";

export type SendResult = { ok: true } | { ok: false; error: string };

const fail = (error: string): SendResult => ({ ok: false, error });

// ---------- Email (SMTP first, Resend as an alternative) ----------
export function emailConfigured(): boolean {
  return Boolean(
    (process.env.SMTP_USER && process.env.SMTP_PASS) || process.env.RESEND_API_KEY,
  );
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<SendResult> {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || "";
  try {
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      const port = Number(process.env.SMTP_PORT || 465);
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transport.sendMail({ from, to, subject, html, text });
      return { ok: true };
    }
    if (process.env.RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: from || `${APP_NAME} <onboarding@resend.dev>`, to, subject, html, text }),
      });
      if (!res.ok) return fail(`Resend rejected the email (${res.status}): ${await res.text()}`);
      return { ok: true };
    }
    return fail("Email sending isn't set up yet. Add SMTP or Resend settings on Vercel.");
  } catch (e) {
    return fail(`Couldn't send the email: ${(e as Error).message}`);
  }
}

// ---------- Telegram ----------
export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export async function sendTelegram(chatId: string, text: string): Promise<SendResult> {
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
      const body = (await res.json().catch(() => ({}))) as { description?: string };
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

export async function sendDiscord(webhookUrl: string, content: string): Promise<SendResult> {
  if (!DISCORD_WEBHOOK_RE.test(webhookUrl)) return fail("That doesn't look like a Discord webhook URL.");
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: APP_NAME, content: content.slice(0, 1990) }),
    });
    if (!res.ok) return fail(`Discord rejected the message (${res.status}). Check the webhook still exists.`);
    return { ok: true };
  } catch (e) {
    return fail(`Couldn't reach Discord: ${(e as Error).message}`);
  }
}
