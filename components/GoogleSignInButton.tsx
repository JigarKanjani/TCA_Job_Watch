"use client";

import { useState } from "react";
import { GoogleIcon } from "./GoogleIcon";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/config";

export function GoogleSignInButton({
  next = "/dashboard",
  label = "Continue with Google",
  className = "btn btn-google",
}: {
  next?: string;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    if (!isSupabaseConfigured) {
      setError("Sign-in isn't switched on yet. Check back shortly.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setBusy(false);
      setError(`Google sign-in didn't start: ${error.message}`);
    }
    // On success the browser is redirected to Google.
  }

  return (
    <div style={{ display: "grid", gap: 8, justifyItems: "inherit" }}>
      <button type="button" className={className} onClick={signIn} disabled={busy}>
        <GoogleIcon />
        {busy ? "Opening Google…" : label}
      </button>
      {error && (
        <p className="small" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
