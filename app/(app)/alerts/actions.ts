"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isDemoEmail } from "@/lib/demo";
import { allow } from "@/lib/ratelimit";
import { isUuid } from "@/lib/sanitize";

export async function setAlertActive(form: FormData) {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) redirect("/alerts?flash=demo_readonly");
  const id = form.get("id");
  const active = form.get("active") === "true";
  if (!isUuid(id) || !(await allow("writes", user.id))) return;
  await supabase.from("alerts").update({ active }).eq("id", id);
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}

export async function deleteAlert(form: FormData) {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) redirect("/alerts?flash=demo_readonly");
  const id = form.get("id");
  if (!isUuid(id) || !(await allow("writes", user.id))) redirect("/alerts");
  await supabase.from("alerts").delete().eq("id", id);
  revalidatePath("/dashboard");
  redirect("/alerts?flash=alert_deleted");
}
