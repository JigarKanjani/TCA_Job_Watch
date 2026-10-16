import "server-only";
import { redirect } from "next/navigation";
import { getUser } from "./supabase/server";
import type { Profile } from "./types";

// Every app page calls this: no session, no page.
export async function requireUser() {
  const { supabase, user } = await getUser();
  if (!supabase || !user) redirect("/login?error=not_signed_in");
  return { supabase, user };
}

export async function requireProfile() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  return { supabase, user, profile: data };
}
