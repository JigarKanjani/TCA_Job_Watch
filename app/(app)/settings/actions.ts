"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile, requireUser } from "@/lib/auth";
import { APP_NAME } from "@/lib/config";
import { DISCORD_WEBHOOK_RE, sendDiscord, sendEmail, sendTelegram } from "@/lib/notify";
import { DEMO_MESSAGE, isDemoEmail } from "@/lib/demo";

export type TestState = { ok?: boolean; message?: string };

export async function saveDiscord(form: FormData) {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) redirect("/settings?flash=demo_readonly");
  const url = String(form.get("discord_webhook_url") ?? "").trim();
  if (url && !DISCORD_WEBHOOK_RE.test(url)) redirect("/settings?flash=discord_invalid");
  await supabase.from("profiles").update({ discord_webhook_url: url || null }).eq("id", user.id);
  revalidatePath("/settings");
  redirect(`/settings?flash=${url ? "discord_saved" : "discord_removed"}`);
}

export async function saveBaseResume(form: FormData) {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) redirect("/settings?flash=demo_readonly");
  const id = String(form.get("doc_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/settings");
  const { error } = await supabase.from("profiles").update({ base_resume_doc_id: id }).eq("id", user.id);
  revalidatePath("/settings");
  redirect(`/settings?flash=${error ? "base_resume_failed" : "base_resume_saved"}`);
}

export async function disconnectTelegram() {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) redirect("/settings?flash=demo_readonly");
  await supabase.rpc("disconnect_telegram");
  revalidatePath("/settings");
  redirect("/settings?flash=telegram_disconnected");
}

export async function sendTest(_prev: TestState, form: FormData): Promise<TestState> {
  const { profile, user } = await requireProfile();
  if (isDemoEmail(user.email)) return { ok: false, message: DEMO_MESSAGE };
  const channel = String(form.get("channel"));
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const line = `This is a test from ${APP_NAME}. When a matching role is posted, it'll arrive here like this.`;

  if (channel === "email") {
    const to = profile?.email ?? user.email;
    if (!to) return { ok: false, message: "Your account has no email address." };
    const r = await sendEmail(
      to,
      `${APP_NAME} test alert`,
      `<p>${line}</p><p><a href="${site}/dashboard">Open your dashboard</a></p>`,
      `${line}\n\n${site}/dashboard`,
    );
    return r.ok ? { ok: true, message: `Sent to ${to}.` } : { ok: false, message: r.error };
  }
  if (channel === "telegram") {
    if (!profile?.telegram_chat_id) return { ok: false, message: "Connect Telegram first." };
    const r = await sendTelegram(profile.telegram_chat_id, `✅ ${line}`);
    return r.ok ? { ok: true, message: "Sent — check Telegram." } : { ok: false, message: r.error };
  }
  if (channel === "discord") {
    if (!profile?.discord_webhook_url) return { ok: false, message: "Save a Discord webhook first." };
    const r = await sendDiscord(profile.discord_webhook_url, `✅ ${line}`);
    return r.ok ? { ok: true, message: "Sent — check your Discord channel." } : { ok: false, message: r.error };
  }
  return { ok: false, message: "Unknown channel." };
}
