import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { originFrom, safeNext } from "@/lib/redirect";

// Lands here after Google sign-in (?code=...), after an emailed link
// (?code=...), or right after a password sign-in (session already set).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = originFrom(request);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), "/dashboard");

  if (!isSupabaseConfigured) return NextResponse.redirect(`${origin}/login?error=not_configured`);

  const supabase = await createClient();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?error=not_signed_in`);

  // Password resets go straight to the new-password screen.
  if (next === "/auth/reset") return NextResponse.redirect(`${origin}/auth/reset`);

  // First-timers set up their first alert; everyone else goes where they were headed.
  const { count } = await supabase.from("alerts").select("id", { count: "exact", head: true });
  const destination = (count ?? 0) === 0 ? "/onboarding" : next === "/onboarding" ? "/dashboard" : next;
  return NextResponse.redirect(`${origin}${destination}`);
}
