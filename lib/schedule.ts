// Delivery windows in the user's own timezone: is one open right now, and if
// not, exactly when does the next one open? Mirrors window_open() in
// worker/run_alerts.py. Days are 0 = Monday … 6 = Sunday.
import { WINDOWS } from "./config";

const QUARTER = 15 * 60 * 1000;
const DAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function safeZone(tz: string | null | undefined): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz ?? undefined });
    return tz || "America/Edmonton";
  } catch {
    return "America/Edmonton";
  }
}

function localParts(at: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: DAY_INDEX[get("weekday")] ?? 0, hour: Number(get("hour")) % 24, minute: Number(get("minute")) };
}

export function windowOpenAt(windows: readonly string[], tz: string, at: Date): boolean {
  const { day, hour } = localParts(at, tz);
  return windows.some((w) => {
    const def = WINDOWS.find((x) => x.value === w);
    if (!def) return false;
    // Night-owl hours after midnight belong to the previous evening's window.
    const d = w === "night_owl" && hour < 2 ? (day + 6) % 7 : day;
    return (def.days as readonly number[]).includes(d) && (def.hours as readonly number[]).includes(hour);
  });
}

/** `from` itself if a window is open, otherwise the moment the next one opens (within 8 days). */
export function nextWindowStart(windows: readonly string[], tz: string, from = new Date()): Date | null {
  if (windowOpenAt(windows, tz, from)) return from;
  // Quarter-hour steps also catch zones offset by :30 or :45 (Newfoundland, India).
  let t = new Date(Math.ceil(from.getTime() / QUARTER) * QUARTER);
  for (let i = 0; i < 8 * 96; i++, t = new Date(t.getTime() + QUARTER)) {
    if (windowOpenAt(windows, tz, t)) return new Date(t.getTime() - localParts(t, tz).minute * 60000);
  }
  return null;
}

/** "Mon, Oct 19, 7:00 AM MDT" in the user's timezone. */
export function formatLocal(at: Date, tz: string, withDay = true) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    ...(withDay ? { weekday: "short", month: "short", day: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(at);
}

export function windowsLabel(windows: readonly string[]) {
  return windows
    .map((w) => WINDOWS.find((x) => x.value === w))
    .filter(Boolean)
    .map((d) => `${d!.label} (${d!.detail.replace(/^.*· /, "")})`)
    .join(", ");
}
