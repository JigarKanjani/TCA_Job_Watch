"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export async function deleteDocument(form: FormData) {
  const { supabase } = await requireUser();
  const id = String(form.get("id") ?? "");
  const { data: doc } = await supabase.from("documents").select("storage_path").eq("id", id).maybeSingle();
  if (doc) {
    await supabase.storage.from("documents").remove([doc.storage_path]);
    await supabase.from("documents").delete().eq("id", id);
  }
  revalidatePath("/documents");
  redirect("/documents?flash=doc_deleted");
}
