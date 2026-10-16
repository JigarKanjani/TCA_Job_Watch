"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/config";

type Mode = "signin" | "signup" | "forgot";

export function EmailAuthForm({ next, initialMode = "signin" }: { next: string; initialMode?: "signin" | "signup" }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const callback = (dest: string) =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(dest)}`;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      setMessage({ kind: "err", text: "Sign-in isn't switched on yet. Check back shortly." });
      return;
    }
    setBusy(true);
    setMessage(null);
    setNeedsConfirm(false);
    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) {
        if (/confirm/i.test(error.message)) {
          setNeedsConfirm(true);
          setMessage({ kind: "err", text: "Confirm your email first — check your inbox for the link." });
        } else {
          setMessage({ kind: "err", text: "That email and password don't match. Try again or reset your password." });
        }
        return;
      }
      router.replace(`/auth/callback?next=${encodeURIComponent(next)}&session=1`);
      return;
    }

    if (mode === "signup") {
      if (password.length < 8) {
        setBusy(false);
        setMessage({ kind: "err", text: "Use at least 8 characters for your password." });
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callback("/onboarding"), data: { full_name: name.trim() || undefined } },
      });
      setBusy(false);
      if (error) {
        setMessage({ kind: "err", text: error.message });
        return;
      }
      if (data.session) {
        router.replace("/onboarding");
        return;
      }
      setMessage({
        kind: "ok",
        text: `Almost there. We sent a confirmation link to ${email}. Open it to finish creating your account.`,
      });
      return;
    }

    // forgot
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback("/auth/reset") });
    setBusy(false);
    if (error) {
      setMessage({ kind: "err", text: error.message });
      return;
    }
    setMessage({ kind: "ok", text: `If an account exists for ${email}, a reset link is on its way.` });
  }

  async function resend() {
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: callback("/onboarding") },
    });
    setMessage(
      error
        ? { kind: "err", text: error.message }
        : { kind: "ok", text: `Sent a fresh confirmation link to ${email}.` },
    );
  }

  return (
    <form className="stack auth-form" onSubmit={onSubmit} noValidate>
      <div className="seg auth-tabs" role="tablist" aria-label="Account">
        <button type="button" role="tab" aria-pressed={mode === "signin"} aria-selected={mode === "signin"} onClick={() => { setMode("signin"); setMessage(null); }}>
          Sign in
        </button>
        <button type="button" role="tab" aria-pressed={mode === "signup"} aria-selected={mode === "signup"} onClick={() => { setMode("signup"); setMessage(null); }}>
          Create account
        </button>
      </div>

      {mode === "signup" && (
        <div className="field">
          <label htmlFor="auth-name">Name</label>
          <input id="auth-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </div>
      )}
      <div className="field">
        <label htmlFor="auth-email">Email</label>
        <input id="auth-email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </div>
      {mode !== "forgot" && (
        <div className="field">
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            className="input"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
          />
        </div>
      )}

      {message && (
        <p className={`notice ${message.kind === "ok" ? "notice-ok" : "notice-err"}`} role="status">
          {message.text}
        </p>
      )}
      {needsConfirm && (
        <button type="button" className="btn btn-outline btn-sm" onClick={resend}>
          Resend confirmation email
        </button>
      )}

      <button className="btn btn-dark btn-block" type="submit" disabled={busy || !email}>
        {busy ? "One moment…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
      </button>

      <p className="small muted" style={{ textAlign: "center" }}>
        {mode === "forgot" ? (
          <button type="button" className="linklike" onClick={() => setMode("signin")}>Back to sign in</button>
        ) : (
          <button type="button" className="linklike" onClick={() => { setMode("forgot"); setMessage(null); }}>Forgot your password?</button>
        )}
      </p>
    </form>
  );
}
