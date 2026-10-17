import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { TELEGRAM_BOT_USERNAME } from "@/lib/config";
import { emailConfigured, telegramConfigured } from "@/lib/notify";
import { entitlementsFor, PRICING } from "@/lib/plans";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import Link from "next/link";
import { disconnectTelegram, saveBaseResume, saveDiscord } from "./actions";
import { TestButton } from "./TestButton";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ flash?: string }> }) {
  const { flash } = await searchParams;
  const { supabase, user, profile } = await requireProfile();
  const { data: resumes } = await supabase.from("documents").select("id, name").eq("kind", "resume").order("created_at", { ascending: false });
  const ent = entitlementsFor(profile?.plan);
  const email = profile?.email ?? user.email ?? "";
  const tgReady = Boolean(TELEGRAM_BOT_USERNAME) && telegramConfigured();
  const tgLink = tgReady && profile ? `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${profile.telegram_link_token}` : null;

  return (
    <>
      {flash === "discord_invalid" ? (
        <p className="notice notice-err flash">That Discord webhook URL doesn&apos;t look right. It starts with https://discord.com/api/webhooks/</p>
      ) : (
        <Flash code={flash} />
      )}
      <div className="page-head">
        <div>
          <span className="eyebrow">Settings</span>
          <h1>Where your alerts go</h1>
        </div>
      </div>

      <div className="dash-grid">
        <div className="panel">
          <div className="chan-row">
            <div className="info">
              <b>✉︎ Email</b>
              <span className="small muted">{email}</span>
              {!emailConfigured() && <span className="small text-warn">Email delivery is being switched on.</span>}
            </div>
            <TestButton channel="email" disabled={!emailConfigured()} />
          </div>

          <div className="chan-row">
            <div className="info">
              <b>✈ Telegram</b>
              {profile?.telegram_chat_id ? (
                <span className="small text-ok">Connected</span>
              ) : tgLink ? (
                <span className="small muted">Tap Connect, then press <b>Start</b> in Telegram. Refresh this page afterwards.</span>
              ) : (
                <span className="small text-warn">Telegram is being switched on.</span>
              )}
            </div>
            <div className="row">
              {profile?.telegram_chat_id ? (
                <>
                  <TestButton channel="telegram" />
                  <form action={disconnectTelegram}>
                    <SubmitButton className="btn btn-ghost btn-sm" pendingText="…">Disconnect</SubmitButton>
                  </form>
                </>
              ) : tgLink ? (
                <a className="btn btn-accent btn-sm" href={tgLink} target="_blank" rel="noopener noreferrer">Connect Telegram</a>
              ) : null}
            </div>
          </div>

          <div className="chan-row" style={{ display: "block" }}>
            <div className="info" style={{ marginBottom: 10 }}>
              <b>◈ Discord</b>
              <span className="small muted">
                {profile?.discord_webhook_url ? "Posting to your saved channel webhook." : "Paste a channel webhook: Channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL."}
              </span>
            </div>
            <form action={saveDiscord} className="row" style={{ alignItems: "stretch" }}>
              <input
                className="input"
                style={{ flex: "1 1 260px" }}
                name="discord_webhook_url"
                defaultValue={profile?.discord_webhook_url ?? ""}
                placeholder="https://discord.com/api/webhooks/…"
                aria-label="Discord webhook URL"
              />
              <SubmitButton className="btn btn-dark btn-sm">Save</SubmitButton>
            </form>
            {profile?.discord_webhook_url && (
              <div style={{ marginTop: 10 }}>
                <TestButton channel="discord" />
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <span className="eyebrow">Base resume</span>
            <p className="small muted" style={{ margin: "8px 0 12px" }}>
              The Application kit on every job tailors this resume and builds your cover letters, follow-ups and interview prep from it.
            </p>
            {resumes?.length ? (
              <form action={saveBaseResume} className="row" style={{ alignItems: "stretch" }}>
                <select className="input" style={{ flex: "1 1 200px" }} name="doc_id" defaultValue={profile?.base_resume_doc_id ?? resumes[0].id} aria-label="Base resume">
                  {resumes.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <SubmitButton className="btn btn-dark btn-sm">Save</SubmitButton>
              </form>
            ) : (
              <p className="small">No resume yet.</p>
            )}
            <p className="hint" style={{ marginTop: 10 }}>
              <Link className="linklike" href="/documents">Upload a resume</Link> (PDF or Word works best).
            </p>
          </div>
          <div className="panel">
            <span className="eyebrow">Your plan</span>
            <h2 style={{ fontSize: "1.3rem", margin: "8px 0 6px" }}>{ent.label}</h2>
            <p className="muted small">{PRICING.free.blurb}</p>
            <ul className="plain-list small">
              <li>Instant alerts {ent.instantAlerts ? "✓" : "— Pro"}</li>
              <li>24/7 delivery window {ent.aroundTheClock ? "✓" : "— Pro"}</li>
              <li>Up to {ent.maxDocuments} resumes &amp; cover letters</li>
            </ul>
            <p className="hint" style={{ marginTop: 10 }}>Pro is coming soon. Everything is unlocked during the beta.</p>
          </div>
          <div className="panel">
            <span className="eyebrow">Account</span>
            <p className="small" style={{ margin: "8px 0 12px" }}>Signed in as <b>{email}</b></p>
            <form action="/auth/signout" method="post">
              <button className="btn btn-outline btn-sm" type="submit">Sign out</button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
