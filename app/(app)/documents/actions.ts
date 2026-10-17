"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isDemoEmail } from "@/lib/demo";
import { allow } from "@/lib/ratelimit";
import { isUuid } from "@/lib/sanitize";

export async function deleteDocument(form: FormData) {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) redirect("/documents?flash=demo_readonly");
  const id = form.get("id");
  if (!isUuid(id) || !(await allow("writes", user.id))) redirect("/documents");
  const { data: doc } = await supabase.from("documents").select("storage_path").eq("id", id).maybeSingle();
  if (doc) {
    await supabase.storage.from("documents").remove([doc.storage_path]);
    await supabase.from("documents").delete().eq("id", id);
  }
  revalidatePath("/documents");
  redirect("/documents?flash=doc_deleted");
}
