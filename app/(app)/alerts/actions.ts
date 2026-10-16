"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export async function setAlertActive(form: FormData) {
  const { supabase } = await requireUser();
  const id = String(form.get("id") ?? "");
  const active = String(form.get("active")) === "true";
  await supabase.from("alerts").update({ active }).eq("id", id);
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}

export async function deleteAlert(form: FormData) {
  const { supabase } = await requireUser();
  const id = String(form.get("id") ?? "");
  await supabase.from("alerts").delete().eq("id", id);
  revalidatePath("/dashboard");
  redirect("/alerts?flash=alert_deleted");
}
