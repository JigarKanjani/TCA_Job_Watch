"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  CITY_SUGGESTIONS,
  COUNTRIES,
  DEFAULT_WINDOWS,
  FREQUENCIES,
  ROLE_SUGGESTIONS,
  WINDOWS,
  WINDOW_PRESETS,
  WORK_MODES,
  labelFor,
  type Channel,
  type Frequency,
  type WindowId,
  type WorkMode,
} from "@/lib/config";
import { placeLabel } from "@/lib/format";
import { SubmitButton } from "@/components/SubmitButton";
import { createAlert, type CreateAlertState } from "./actions";

const TIMEZONES = [
  "America/Vancouver",
  "America/Edmonton",
  "America/Regina",
  "America/Winnipeg",
  "America/Toronto",
  "America/Halifax",
  "America/St_Johns",
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "America/Chicago",
  "America/New_York",
  "America/Anchorage",
  "Pacific/Honolulu",
];

const STEPS = ["Role", "Where", "Filters", "When", "Send to", "Review"] as const;

type Props = {
  email: string;
  telegramConnected: boolean;
  telegramAvailable: boolean;
  hasDiscord: boolean;
  allowInstant: boolean;
  allowAlways: boolean;
};

export function OnboardingWizard(props: Props) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [role, setRole] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState<string>("Canada");
  const [workMode, setWorkMode] = useState<WorkMode>("any");
  const [minSalary, setMinSalary] = useState("");
  const [maxExperience, setMaxExperience] = useState("");
  const [excludes, setExcludes] = useState("");
  const [frequency, setFrequency] = useState<Frequency>(props.allowInstant ? "instant" : "daily");
  const [windows, setWindows] = useState<WindowId[]>(DEFAULT_WINDOWS);
  const [timezone, setTimezone] = useState("America/Edmonton");
  const [channels, setChannels] = useState<Channel[]>(["email"]);
  const [discordUrl, setDiscordUrl] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [state, formAction] = useActionState<CreateAlertState, FormData>(createAlert, {});

  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) setTimezone(tz);
    } catch {
      /* keep the default */
    }
  }, []);

  const tzOptions = useMemo(() => (TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]), [timezone]);

  function validate(i: number): string | null {
    if (i === 0 && role.trim().length < 2) return "Type the role you want, like “Business Analyst”.";
    if (i === 2) {
      if (minSalary && !/^\d[\d,]*$/.test(minSalary.trim())) return "Minimum salary should be a number, like 65000.";
      if (maxExperience && !/^\d{1,2}$/.test(maxExperience.trim())) return "Experience should be a number of years.";
    }
    if (i === 3 && windows.length === 0) return "Pick at least one delivery window.";
    if (i === 4) {
      if (channels.length === 0) return "Pick at least one place to send alerts.";
      if (channels.includes("discord") && !props.hasDiscord && !discordUrl.trim()) return "Paste your Discord channel webhook, or untick Discord.";
    }
    return null;
  }

  function go(to: number) {
    if (to > step) {
      const err = validate(step);
      if (err) return setLocalError(err);
    }
    setLocalError(null);
    setDir(to > step ? "fwd" : "back");
    setStep(to);
  }

  function toggle<T extends string>(list: T[], v: T, set: (x: T[]) => void) {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  }

  function toggleWindow(w: WindowId) {
    if (w === "always") return setWindows(windows.includes("always") ? DEFAULT_WINDOWS : ["always"]);
    const base = windows.filter((x) => x !== "always");
    setWindows(base.includes(w) ? base.filter((x) => x !== w) : [...base, w]);
  }

  const presetActive = (ws: readonly WindowId[]) => ws.length === windows.length && ws.every((w) => windows.includes(w));
  const windowSummary = windows.map((w) => labelFor(WINDOWS, w)).join(", ");

  return (
    <div className="panel wizard">
      <div className="steps-bar" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span key={s} className={i <= step ? "on" : undefined} />
        ))}
      </div>
      <p className="eyebrow">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>

      <div className={`step-pane ${dir}`} key={step}>
        {step === 0 && (
          <div className="stack">
            <h2>Which role are you after?</h2>
            <p className="muted">Use the job title you&apos;d search for. You can add more alerts later.</p>
            <div className="field">
              <label htmlFor="role">Role or job title</label>
              <input id="role" className="input input-lg" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Supply Chain Analyst" autoFocus maxLength={100} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), go(1))} />
            </div>
            <div className="seg">
              {ROLE_SUGGESTIONS.map((r) => (
                <button key={r} type="button" className="chip" onClick={() => setRole(r)}>{r}</button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="stack">
            <h2>Where should it be?</h2>
            <div className="field">
              <label htmlFor="city">City <span className="hint">(leave blank to search the whole country)</span></label>
              <input id="city" className="input input-lg" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Calgary, AB" maxLength={100} />
            </div>
            <div className="seg">
              {CITY_SUGGESTIONS.map((c) => (
                <button key={c} type="button" className="chip" onClick={() => setCity(c)}>{c}</button>
              ))}
            </div>
            <div className="field">
              <span className="label">Country</span>
              <div className="seg" role="group" aria-label="Country">
                {COUNTRIES.map((c) => (
                  <button key={c} type="button" aria-pressed={country === c} onClick={() => setCountry(c)}>{c}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="label">Work style</span>
              <div className="seg" role="group" aria-label="Work style">
                {WORK_MODES.map((m) => (
                  <button key={m.value} type="button" aria-pressed={workMode === m.value} onClick={() => setWorkMode(m.value)}>{m.label}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <h2>Any deal-breakers?</h2>
            <p className="muted">All optional. Leave anything blank to skip it.</p>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="min_salary">Minimum salary <span className="hint">per year</span></label>
                <input id="min_salary" className="input" inputMode="numeric" value={minSalary} onChange={(e) => setMinSalary(e.target.value)} placeholder="e.g. 65000" />
                <span className="hint">Only filters jobs that list a salary.</span>
              </div>
              <div className="field">
                <label htmlFor="max_experience">Most years of experience required</label>
                <input id="max_experience" className="input" inputMode="numeric" value={maxExperience} onChange={(e) => setMaxExperience(e.target.value)} placeholder="e.g. 5" />
                <span className="hint">Skips roles asking for more.</span>
              </div>
            </div>
            <div className="field">
              <label htmlFor="exclude_keywords">Skip titles containing</label>
              <input id="exclude_keywords" className="input" value={excludes} onChange={(e) => setExcludes(e.target.value)} placeholder="e.g. senior, director, intern" />
              <span className="hint">Separate words with commas.</span>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="stack">
            <h2>When should we reach you?</h2>
            <div className="field">
              <span className="label">How often</span>
              <div className="stack" style={{ gap: 8 }}>
                {FREQUENCIES.map((f) => {
                  const locked = f.value === "instant" && !props.allowInstant;
                  return (
                    <button key={f.value} type="button" className="option" aria-pressed={frequency === f.value} disabled={locked} onClick={() => setFrequency(f.value)}>
                      <span className="tick">{frequency === f.value ? "✓" : ""}</span>
                      <span><b>{f.label}{locked ? " · Pro" : ""}</b><small>{f.hint}</small></span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="field">
              <span className="label">Delivery windows <span className="hint">— pick as many as you like</span></span>
              <div className="seg" aria-label="Quick picks">
                {WINDOW_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className={`chip ${presetActive(p.windows) ? "chip-on" : ""}`}
                    disabled={p.windows.includes("always") && !props.allowAlways}
                    onClick={() => setWindows(p.windows)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="window-grid">
                {WINDOWS.map((w) => {
                  const locked = w.value === "always" && !props.allowAlways;
                  return (
                    <button
                      key={w.value}
                      type="button"
                      className={`option ${w.value === "always" ? "option-bold" : ""}`}
                      aria-pressed={windows.includes(w.value)}
                      disabled={locked}
                      onClick={() => toggleWindow(w.value)}
                    >
                      <span className="tick">{windows.includes(w.value) ? "✓" : ""}</span>
                      <span><b>{w.label}{locked ? " · Pro" : ""}</b><small>{w.detail}</small></span>
                    </button>
                  );
                })}
              </div>
              <span className="hint">Matches found outside your windows wait and arrive when the next one opens.</span>
            </div>
            <div className="field">
              <label htmlFor="timezone">Your timezone</label>
              <select id="timezone" className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {tzOptions.map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="stack">
            <h2>Where should alerts go?</h2>
            <p className="muted">Pick one or more.</p>
            <button type="button" className="option" aria-pressed={channels.includes("email")} onClick={() => toggle(channels, "email", setChannels)}>
              <span className="tick">{channels.includes("email") ? "✓" : ""}</span>
              <span><b>Email</b><small>To {props.email || "your sign-in email"}</small></span>
            </button>
            <button type="button" className="option" aria-pressed={channels.includes("telegram")} onClick={() => toggle(channels, "telegram", setChannels)}>
              <span className="tick">{channels.includes("telegram") ? "✓" : ""}</span>
              <span>
                <b>Telegram</b>
                <small>
                  {props.telegramConnected
                    ? "Connected — alerts arrive as chat messages"
                    : props.telegramAvailable
                      ? "You'll connect it in one tap from Settings after saving"
                      : "Connect from Settings once Telegram is switched on"}
                </small>
              </span>
            </button>
            <button type="button" className="option" aria-pressed={channels.includes("discord")} onClick={() => toggle(channels, "discord", setChannels)}>
              <span className="tick">{channels.includes("discord") ? "✓" : ""}</span>
              <span><b>Discord</b><small>{props.hasDiscord ? "Using your saved channel webhook" : "Posts into a channel via webhook"}</small></span>
            </button>
            {channels.includes("discord") && !props.hasDiscord && (
              <div className="field">
                <label htmlFor="discord">Discord channel webhook URL</label>
                <input id="discord" className="input" value={discordUrl} onChange={(e) => setDiscordUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/…" />
                <span className="hint">In Discord: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.</span>
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <form action={formAction} className="stack">
            <h2>Look right?</h2>
            <dl className="review">
              <dt>Role</dt><dd>{role}</dd>
              <dt>Where</dt><dd>{placeLabel(city, country, workMode)}</dd>
              <dt>Filters</dt>
              <dd>
                {[minSalary && `$${Number(minSalary.replace(/,/g, "")).toLocaleString()}+ /yr`, maxExperience && `≤ ${maxExperience} yrs exp.`, excludes && `skip: ${excludes}`].filter(Boolean).join(" · ") || "None"}
              </dd>
              <dt>How often</dt><dd>{labelFor(FREQUENCIES, frequency)}</dd>
              <dt>Windows</dt><dd>{windowSummary}</dd>
              <dt>Timezone</dt><dd>{timezone.replace(/_/g, " ")}</dd>
              <dt>Send to</dt><dd>{channels.map((c) => c[0].toUpperCase() + c.slice(1)).join(", ")}</dd>
            </dl>
            <input type="hidden" name="role" value={role} />
            <input type="hidden" name="city" value={city} />
            <input type="hidden" name="country" value={country} />
            <input type="hidden" name="work_mode" value={workMode} />
            <input type="hidden" name="min_salary" value={minSalary} />
            <input type="hidden" name="max_experience" value={maxExperience} />
            <input type="hidden" name="exclude_keywords" value={excludes} />
            <input type="hidden" name="frequency" value={frequency} />
            <input type="hidden" name="timezone" value={timezone} />
            <input type="hidden" name="discord_webhook_url" value={discordUrl} />
            {channels.map((c) => <input key={c} type="hidden" name="channels" value={c} />)}
            {windows.map((w) => <input key={w} type="hidden" name="windows" value={w} />)}
            {state.error && <p className="notice notice-err" role="alert">{state.error}</p>}
            <div className="wizard-foot">
              <button type="button" className="btn btn-ghost" onClick={() => go(4)}>← Back</button>
              <SubmitButton className="btn btn-accent" pendingText="Saving…">Start watching</SubmitButton>
            </div>
          </form>
        )}
      </div>

      {localError && <p className="notice notice-err" role="alert" style={{ marginTop: 16 }}>{localError}</p>}

      {step < 5 && (
        <div className="wizard-foot">
          <button type="button" className="btn btn-ghost" onClick={() => go(step - 1)} disabled={step === 0}>← Back</button>
          <button type="button" className="btn btn-dark" onClick={() => go(step + 1)}>
            {step === 2 ? (minSalary || maxExperience || excludes ? "Next →" : "Skip →") : "Next →"}
          </button>
        </div>
      )}
    </div>
  );
}
