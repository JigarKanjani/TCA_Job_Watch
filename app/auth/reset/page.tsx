import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPage() {
  const { user } = await getUser();
  if (!user) redirect("/login?error=link_expired");
  return (
    <div className="wrap">
      <div className="panel login-card reveal-up">
        <span className="eyebrow">Account</span>
        <h1>Choose a new password</h1>
        <p className="muted" style={{ marginBottom: 20 }}>For {user.email}</p>
        <ResetPasswordForm />
      </div>
    </div>
  );
}
