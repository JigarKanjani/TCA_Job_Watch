import { Fragment } from "react";
import Link from "next/link";
import { APP_NAME, WINDOWS } from "@/lib/config";
import { PRICING } from "@/lib/plans";
import { getUser } from "@/lib/supabase/server";
import { getAuthSettings } from "@/lib/authSettings";
import { demoEnabled } from "@/lib/demo";
import { DemoButton } from "@/components/DemoButton";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { HeroRadar } from "@/components/HeroRadar";

const HEADLINE = "The right role gets posted while you're refreshing the wrong tab.";

const TICKER = [
  "Supply Chain Analyst · Calgary",
  "Business Analyst · Remote",
  "Program Coordinator · Edmonton",
  "Data Analyst · Toronto",
  "IT Support Analyst · Calgary",
  "Procurement Specialist · Vancouver",
  "HR Coordinator · Remote US",
  "Operations Analyst · Austin",
  "Project Coordinator · Ottawa",
  "Marketing Coordinator · Montreal",
];

export default async function Home() {
  const [{ user }, auth] = await Promise.all([getUser(), getAuthSettings()]);
  const cta = user ? (
    <Link className="btn btn-google btn-glow" href="/dashboard">Go to my dashboard →</Link>
  ) : auth.google ? (
    <GoogleSignInButton next="/onboarding" className="btn btn-google btn-glow" />
  ) : (
    <Link className="btn btn-google btn-glow" href="/login?mode=signup">Get started free →</Link>
  );

  return (
    <>
      <section className="hero wrap">
        <div className="hero-grid">
          <div>
            <span className="eyebrow hero-in" style={{ animationDelay: "0ms" }}>Job alerts + application tracker · Canada &amp; US</span>
            <h1 className="headline" aria-label={HEADLINE}>
              {HEADLINE.split(" ").map((w, i, all) => (
                <Fragment key={i}>
                  <span className="word" style={{ animationDelay: `${120 + i * 55}ms` }} aria-hidden="true">
                    {w}
                  </span>
                  {i < all.length - 1 ? " " : null}
                </Fragment>
              ))}
            </h1>
            <p className="lede hero-in" style={{ animationDelay: "700ms" }}>
              Tell {APP_NAME} the roles you want. It scans LinkedIn and Indeed around the clock, pings you on email,
              Telegram or Discord inside the hours you choose, and keeps every application, resume and cover letter in one log.
            </p>
            <div className="hero-cta hero-in" style={{ animationDelay: "820ms" }}>
              {cta}
              {!user && demoEnabled && <DemoButton />}
              {!user && auth.google && <Link className="btn btn-ghost" href="/login">Use email instead</Link>}
            </div>
            <div className="trust hero-in" style={{ animationDelay: "940ms" }}>
              <span><i className="dot" /> No app to install</span>
              <span><i className="dot" /> Set up in about a minute</span>
              <span><i className="dot" /> Free during beta</span>
            </div>
          </div>
          <div className="hero-in" style={{ animationDelay: "300ms" }}>
            <HeroRadar />
          </div>
        </div>
      </section>

      <div className="ticker" aria-label="Examples of roles people watch">
        <div className="ticker-track">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={i} className="ticker-item" aria-hidden={i >= TICKER.length}>
              <i className="dot" /> {t}
            </span>
          ))}
        </div>
      </div>

      <section className="section wrap" id="how">
        <div className="sec-head reveal">
          <span className="eyebrow">How it works</span>
          <h2>Three steps, then {APP_NAME} does the checking.</h2>
          <p>No more opening the same ten tabs every morning. Set it once and it works while you sleep.</p>
        </div>
        <div className="grid-3">
          {[
            { n: "01", t: "Sign in", d: "One tap with Google, or email and password. No new inbox to babysit." },
            { n: "02", t: "Tell it what you want", d: "Role, city, remote or in-person, salary floor, experience cap, and the hours you want to hear from us." },
            { n: "03", t: "Hear first, track everything", d: "Matches arrive with an apply link and a one-tap “Track it” link into your application log." },
          ].map((s) => (
            <div className="tile reveal lift" key={s.n}>
              <div className="n">{s.n}</div>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section wrap">
        <div className="split">
          <div className="sec-head reveal">
            <span className="eyebrow">Your hours, not ours</span>
            <h2>Pick exactly when you want to be pinged.</h2>
            <p>
              Choose one window or stack several. Anything found outside your hours waits politely and arrives when your next
              window opens — in your own timezone.
            </p>
          </div>
          <div className="window-showcase reveal">
            {WINDOWS.map((w, i) => (
              <div key={w.value} className={`window-chip ${w.value === "always" ? "caffeine" : ""}`} style={{ animationDelay: `${i * 70}ms` }}>
                <b>{w.label}</b>
                <span>{w.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section wrap">
        <div className="sec-head reveal">
          <span className="eyebrow">Your alerts, your way</span>
          <h2>Delivered where you already are.</h2>
          <p>Use one channel or all three.</p>
        </div>
        <div className="grid-3">
          <div className="tile reveal lift">
            <div className="ic">✉︎</div>
            <h3>Email</h3>
            <p>Sent to the address you sign in with. Nothing to set up.</p>
            <p style={{ marginTop: 12 }}><span className="tag">Zero setup</span></p>
          </div>
          <div className="tile reveal lift">
            <div className="ic">✈</div>
            <h3>Telegram</h3>
            <p>Tap Connect, press Start in Telegram, done. Matches arrive as chat messages.</p>
            <p style={{ marginTop: 12 }}><span className="tag">One tap</span></p>
          </div>
          <div className="tile reveal lift">
            <div className="ic">◈</div>
            <h3>Discord</h3>
            <p>Paste a channel webhook and new roles drop into your server, solo or with friends.</p>
            <p style={{ marginTop: 12 }}><span className="tag">No bot approval</span></p>
          </div>
        </div>
      </section>

      <section className="section wrap">
        <div className="split split-rev">
          <div className="tracker-mock reveal" aria-hidden="true">
            <div className="tm-row tm-head"><span>Role</span><span>Stage</span><span>Resume</span></div>
            {[
              ["Supply Chain Analyst", "Interviewing", "SC Resume v3"],
              ["Business Analyst", "Applied", "BA Resume v2"],
              ["Procurement Specialist", "Saved", "—"],
              ["Data Analyst", "Offer", "Data Resume v1"],
            ].map(([r, s, d], i) => (
              <div className="tm-row" key={r} style={{ animationDelay: `${i * 90}ms` }}>
                <span>{r}</span>
                <span className={`tm-stage st-${s.toLowerCase()}`}>{s}</span>
                <span className="muted">{d}</span>
              </div>
            ))}
          </div>
          <div className="sec-head reveal">
            <span className="eyebrow">Built-in application tracker</span>
            <h2>Remember exactly what you sent, and where.</h2>
            <p>
              Every job you&apos;re sent lands in your log automatically. Move it from Saved to Applied to Interviewing,
              note the resume and cover letter version you used, keep the full job description even after the posting
              disappears, and add any job from anywhere by pasting its link.
            </p>
          </div>
        </div>
      </section>

      <section className="section wrap" id="pricing">
        <div className="sec-head reveal">
          <span className="eyebrow">Plans</span>
          <h2>Free while we&apos;re in beta.</h2>
          <p>Everything is unlocked during the beta. A Pro plan is coming for power users.</p>
        </div>
        <div className="plans">
          <div className="plan reveal lift">
            <span className="eyebrow">{PRICING.free.name}</span>
            <div className="plan-price">{PRICING.free.price}</div>
            <p className="muted">{PRICING.free.blurb}</p>
            <ul className="plain-list">
              <li>Alerts for the roles you choose</li>
              <li>Email, Telegram and Discord delivery</li>
              <li>Application tracker &amp; job log</li>
              <li>Resume and cover letter library</li>
            </ul>
          </div>
          <div className="plan plan-pro reveal lift">
            <span className="eyebrow">{PRICING.pro.name}</span>
            <div className="plan-price">{PRICING.pro.price}</div>
            <p className="muted">{PRICING.pro.blurb}</p>
            <ul className="plain-list">
              <li>Instant alerts every couple of hours</li>
              <li>Around-the-clock ☕ delivery window</li>
              <li>Bigger document library</li>
              <li>Priority on new features</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section wrap">
        <div className="sec-head reveal">
          <span className="eyebrow">Questions</span>
          <h2>The short version.</h2>
        </div>
        <div className="faq reveal">
          <details open>
            <summary>Is this a job board?</summary>
            <p>No. {APP_NAME} searches LinkedIn and Indeed for you and sends only the roles that match what you asked for, inside the hours you picked.</p>
          </details>
          <details>
            <summary>I don&apos;t have a Google account. Can I still sign up?</summary>
            <p>Yes. Create an account with your email and a password. We&apos;ll send a link to confirm the address first.</p>
          </details>
          <details>
            <summary>How fast are the alerts?</summary>
            <p>Searches run every couple of hours. Instant alerts go out as soon as a match is found inside one of your delivery windows; digests go out once a day or once a week.</p>
          </details>
          <details>
            <summary>What does the tracker do?</summary>
            <p>Every job you&apos;re sent is logged. You can set its stage, the date you applied, which resume and cover letter you used, notes, and keep the full job description.</p>
          </details>
          <details>
            <summary>Is my data safe?</summary>
            <p>Data is stored in Canada. Your documents sit in a private folder only your account can open. We never post on your behalf and never sell your data.</p>
          </details>
        </div>
      </section>

      <section className="section wrap">
        <div className="cta-band reveal">
          <h2>Stop refreshing. Start getting pinged.</h2>
          <p>Your next role is going to be posted somewhere. Let {APP_NAME} be the one watching.</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            {user ? (
              <Link className="btn btn-google" href="/dashboard">Go to my dashboard →</Link>
            ) : (
              <>
                {auth.google ? <GoogleSignInButton next="/onboarding" /> : <Link className="btn btn-google" href="/login?mode=signup">Get started free →</Link>}
                {demoEnabled ? <DemoButton className="btn btn-on-accent" /> : <Link className="btn btn-on-accent" href="/login">Sign up with email</Link>}
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
