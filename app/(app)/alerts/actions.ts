"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isDemoEmail } from "@/lib/demo";

export async function setAlertActive(form: FormData) {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) redirect("/alerts?flash=demo_readonly");
  const id = String(form.get("id") ?? "");
  const active = String(form.get("active")) === "true";
  await supabase.from("alerts").update({ active }).eq("id", id);
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}

export async function deleteAlert(form: FormData) {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) redirect("/alerts?flash=demo_readonly");
  const id = String(form.get("id") ?? "");
  await supabase.from("alerts").delete().eq("id", id);
  revalidatePath("/dashboard");
  redirect("/alerts?flash=alert_deleted");
}
