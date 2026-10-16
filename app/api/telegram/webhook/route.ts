import { NextResponse } from "next/server";
import { APP_NAME } from "@/lib/config";
import { createAnonClient } from "@/lib/supabase/anon";
import { sendTelegram } from "@/lib/notify";

export const dynamic = "force-dynamic";

type Update = {
  message?: { chat?: { id?: number; type?: string }; text?: string; from?: { first_name?: string } };
};

// Telegram calls this for every message to the bot. Requests are verified with
// the secret token we registered via /api/telegram/setup.
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json().catch(() => ({}))) as Update;
  const chatId = update.message?.chat?.id;
  const text = (update.message?.text ?? "").trim();
  if (!chatId) return NextResponse.json({ ok: true });

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const supabase = createAnonClient();
  const reply = (msg: string) => sendTelegram(String(chatId), msg);

  const start = text.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{16,64})$/);
  if (start) {
    const { data: name, error } = await supabase.rpc("link_telegram", {
      p_secret: secret,
      p_token: start[1],
      p_chat_id: String(chatId),
    });
    if (error) await reply("Something went wrong linking your account. Please try Connect again from Settings.");
    else if (!name) await reply(`That link has expired. Open ${site}/settings and tap Connect Telegram again.`);
    else await reply(`✅ Connected, ${String(name).split(" ")[0]}! ${APP_NAME} alerts will arrive here.\n\nManage alerts: ${site}/alerts\nSend /stop to disconnect.`);
    return NextResponse.json({ ok: true });
  }

  if (/^\/stop(?:@\w+)?$/.test(text)) {
    await supabase.rpc("unlink_telegram", { p_secret: secret, p_chat_id: String(chatId) });
    await reply(`Disconnected. You won't get ${APP_NAME} alerts here anymore. Reconnect any time from ${site}/settings.`);
    return NextResponse.json({ ok: true });
  }

  await reply(`👋 I'm the ${APP_NAME} bot. I send job alerts — set them up at ${site}\n\nTo connect this chat, open Settings on the site and tap Connect Telegram.`);
  return NextResponse.json({ ok: true });
}
