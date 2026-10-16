import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { TELEGRAM_BOT_USERNAME } from "@/lib/config";
import { entitlementsFor } from "@/lib/plans";
import { OnboardingWizard } from "./OnboardingWizard";

export const metadata: Metadata = { title: "New alert" };

export default async function OnboardingPage() {
  const { supabase, user, profile } = await requireProfile();
  const [{ count }, { data: limit }] = await Promise.all([
    supabase.from("alerts").select("id", { count: "exact", head: true }),
    supabase.rpc("my_alert_limit"),
  ]);
  const used = count ?? 0;
  const max = typeof limit === "number" ? limit : 10;
  const ent = entitlementsFor(profile?.plan);

  if (used >= max) {
    return (
      <div className="panel wrap-narrow reveal-up" style={{ marginInline: "auto" }}>
        <span className="eyebrow">Alert limit reached</span>
        <h1 style={{ fontSize: "1.6rem", margin: "8px 0 10px" }}>You&apos;re watching {used} of {max} roles</h1>
        <p className="muted">Delete an alert you no longer need, then add a new one.</p>
        <p style={{ marginTop: 18 }}>
          <Link className="btn btn-dark" href="/alerts">Manage alerts</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="wrap-narrow" style={{ marginInline: "auto" }}>
      <div className="page-head">
        <div>
          <span className="eyebrow">{used === 0 ? "Let's set up your first alert" : `Alert ${used + 1} of ${max}`}</span>
          <h1>What should we watch for you?</h1>
        </div>
      </div>
      <OnboardingWizard
        email={profile?.email ?? user.email ?? ""}
        telegramConnected={Boolean(profile?.telegram_chat_id)}
        telegramAvailable={Boolean(TELEGRAM_BOT_USERNAME)}
        hasDiscord={Boolean(profile?.discord_webhook_url)}
        allowInstant={ent.instantAlerts}
        allowAlways={ent.aroundTheClock}
      />
    </div>
  );
}
