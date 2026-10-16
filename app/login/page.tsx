import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { APP_NAME, isSupabaseConfigured } from "@/lib/config";
import { getUser } from "@/lib/supabase/server";
import { safeNext } from "@/lib/redirect";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { EmailAuthForm } from "@/components/EmailAuthForm";
import { DemoButton } from "@/components/DemoButton";
import { getAuthSettings } from "@/lib/authSettings";
import { demoEnabled } from "@/lib/demo";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  link_expired: "That link has expired or was already used. Request a new one below.",
  link_invalid: "That link isn't valid. Request a new one below.",
  not_signed_in: "Please sign in to continue.",
  not_configured: "Sign-in is being switched on. Check back shortly.",
  demo_unavailable: "The demo is taking a break. Please try again in a minute.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next, "/dashboard");
  const [{ user }, auth] = await Promise.all([getUser(), getAuthSettings()]);
  if (user) redirect(next);

  return (
    <div className="wrap">
      <div className="panel login-card reveal-up">
        <span className="eyebrow">Welcome</span>
        <h1>Sign in to {APP_NAME}</h1>
        <p className="muted" style={{ marginBottom: 22 }}>
          Your alerts, tracker and documents live behind your account.
        </p>
        {params.error && (
          <p className="notice notice-err" style={{ marginBottom: 16, textAlign: "left" }}>
            {ERRORS[params.error] ?? "Sign-in didn't finish. Please try again."}
          </p>
        )}
        {!isSupabaseConfigured && (
          <p className="notice notice-warn" style={{ marginBottom: 16, textAlign: "left" }}>
            Sign-in is being switched on. Check back shortly.
          </p>
        )}
        {auth.google && (
          <>
            <GoogleSignInButton next={next} className="btn btn-google btn-block" />
            <div className="divider"><span>or use email</span></div>
          </>
        )}
        <EmailAuthForm next={next} initialMode={params.mode === "signup" ? "signup" : "signin"} />
        {demoEnabled && (
          <>
            <div className="divider"><span>just looking?</span></div>
            <DemoButton className="btn btn-outline btn-block" label="Explore the live demo — no sign-up" />
          </>
        )}
      </div>
    </div>
  );
}
