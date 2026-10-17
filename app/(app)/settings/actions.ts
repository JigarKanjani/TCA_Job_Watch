"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile, requireUser } from "@/lib/auth";
import { APP_NAME } from "@/lib/config";
import { DISCORD_WEBHOOK_RE, sendDiscord, sendEmail, sendTelegram } from "@/lib/notify";
import { DEMO_MESSAGE, isDemoEmail } from "@/lib/demo";
import { allow, LIMITED } from "@/lib/ratelimit";
import { cleanText, isUuid, oneOf } from "@/lib/sanitize";

export type TestState = { ok?: boolean; message?: string };

export async function saveDiscord(form: FormData) {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) redirect("/settings?flash=demo_readonly");
  const url = cleanText(form.get("discord_webhook_url"), 300);
  if (!(await allow("writes", user.id))) redirect("/settings");
  if (url && !DISCORD_WEBHOOK_RE.test(url)) redirect("/settings?flash=discord_invalid");
  await supabase.from("profiles").update({ discord_webhook_url: url || null }).eq("id", user.id);
  revalidatePath("/settings");
  redirect(`/settings?flash=${url ? "discord_saved" : "discord_removed"}`);
}

export async function saveBaseResume(form: FormData) {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) redirect("/settings?flash=demo_readonly");
  const id = form.get("doc_id");
  if (!isUuid(id) || !(await allow("writes", user.id))) redirect("/settings");
  const { error } = await supabase.from("profiles").update({ base_resume_doc_id: id }).eq("id", user.id);
  revalidatePath("/settings");
  redirect(`/settings?flash=${error ? "base_resume_failed" : "base_resume_saved"}`);
}

export async function setSearchBriefs(form: FormData) {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) redirect("/settings?flash=demo_readonly");
  const on = form.get("on") === "1";
  if (!(await allow("writes", user.id))) redirect("/settings#briefs");
  await supabase.from("profiles").update({ search_briefs: on }).eq("id", user.id);
  revalidatePath("/settings");
  redirect(`/settings?flash=${on ? "briefs_on" : "briefs_off"}#briefs`);
}

// ---------- your data ----------
type Supa = Awaited<ReturnType<typeof requireUser>>["supabase"];

/** Remove every file in the user's private folder (plus any listed in documents). */
async function removeAllFiles(supabase: Supa, userId: string) {
  const { data: rows } = await supabase.from("documents").select("storage_path");
  const { data: listed } = await supabase.storage.from("documents").list(userId, { limit: 1000 });
  const paths = [...new Set([...(rows ?? []).map((r) => r.storage_path as string), ...(listed ?? []).map((f) => `${userId}/${f.name}`)])];
  for (let i = 0; i < paths.length; i += 100) await supabase.storage.from("documents").remove(paths.slice(i, i + 100));
}

export async function deleteMyData(form: FormData) {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) redirect("/settings?flash=demo_readonly#data");
  const what = oneOf(form.get("what"), ["none", "jobs", "documents", "alerts", "everything"] as const, "none");
  if (!(await allow("delete_data", user.id))) redirect("/settings?flash=rate_limited#data");
  if (what === "jobs" || what === "everything") await supabase.from("job_matches").delete().eq("user_id", user.id);
  if (what === "documents" || what === "everything") {
    await removeAllFiles(supabase, user.id);
    await supabase.from("documents").delete().eq("user_id", user.id);
  }
  if (what === "alerts" || what === "everything") await supabase.from("alerts").delete().eq("user_id", user.id);
  if (what === "everything") {
    // Also forget the connected channels; the account itself stays.
    await supabase.from("profiles").update({ discord_webhook_url: null }).eq("id", user.id);
    await supabase.rpc("disconnect_telegram");
  }
  revalidatePath("/", "layout");
  redirect(`/settings?flash=deleted_${what}#data`);
}

export async function deleteMyAccount(form: FormData) {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) redirect("/settings?flash=demo_readonly#data");
  if (cleanText(form.get("confirm"), 20).toUpperCase() !== "DELETE") redirect("/settings?flash=delete_confirm#data");
  if (!(await allow("delete_data", user.id))) redirect("/settings?flash=rate_limited#data");
  await removeAllFiles(supabase, user.id);
  const { error } = await supabase.rpc("delete_my_account");
  if (error) redirect("/settings?flash=delete_failed#data");
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  redirect("/?flash=account_deleted");
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
  if (!(await allow("send_test", user.id))) return { ok: false, message: LIMITED };
  const channel = cleanText(form.get("channel"), 20);
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
