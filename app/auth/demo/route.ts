import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { DEMO_EMAIL, demoEnabled } from "@/lib/demo";
import { originFrom } from "@/lib/redirect";

// One click: sign in as the shared read-only demo account.
export async function POST(request: Request) {
  const origin = originFrom(request);
  if (!isSupabaseConfigured || !demoEnabled) return NextResponse.redirect(`${origin}/login`, { status: 303 });
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: process.env.DEMO_PASSWORD! });
  if (error) return NextResponse.redirect(`${origin}/login?error=demo_unavailable`, { status: 303 });
  return NextResponse.redirect(`${origin}/dashboard`, { status: 303 });
}
