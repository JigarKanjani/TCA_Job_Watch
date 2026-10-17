import { NextResponse } from "next/server";
import { originFrom } from "@/lib/redirect";
import { safeEqual } from "@/lib/security";

export const dynamic = "force-dynamic";

// One-time: visit /api/telegram/setup?key=<TELEGRAM_WEBHOOK_SECRET> after
// deploying to point the bot at this site.
export async function GET(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const key = new URL(request.url).searchParams.get("key");
  if (!secret || !token || !safeEqual(key, secret)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = `${originFrom(request)}/api/telegram/webhook`;
  const api = (method: string, body: unknown) =>
    fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());

  const hook = await api("setWebhook", { url, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true });
  const cmds = await api("setMyCommands", {
    commands: [
      { command: "start", description: "Connect this chat to your account" },
      { command: "stop", description: "Stop sending alerts here" },
    ],
  });
  return NextResponse.json({ ok: Boolean(hook?.ok), webhook: url, setWebhook: hook, setMyCommands: cmds });
}
