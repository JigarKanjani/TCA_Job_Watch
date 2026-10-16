import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { originFrom, safeNext } from "@/lib/redirect";

// Handles emailed links that carry ?token_hash=...&type=... (works even when
// the link is opened on a different device than the one that signed up).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = originFrom(request);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"), type === "recovery" ? "/auth/reset" : "/onboarding");

  if (!isSupabaseConfigured || !tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?error=link_invalid`);
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return NextResponse.redirect(`${origin}/login?error=link_expired`);
  if (type === "recovery") return NextResponse.redirect(`${origin}/auth/reset`);
  return NextResponse.redirect(`${origin}/auth/callback?next=${encodeURIComponent(next)}`);
}
