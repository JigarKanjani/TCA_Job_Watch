// Central place for app-wide settings. Rename the product here.
export const APP_NAME = "JobWatch";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

// The site renders without Supabase (landing page works); sign-in and
// saving alerts switch on once these are set.
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const TELEGRAM_BOT_USERNAME = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, "");

export const WORK_MODES = [
  { value: "any", label: "Any" },
  { value: "remote", label: "Remote" },
  { value: "onsite", label: "In-person" },
] as const;

export const FREQUENCIES = [
  { value: "instant", label: "As soon as found", hint: "Each new match, during your delivery windows" },
  { value: "daily", label: "Daily digest", hint: "One roundup a day, in your first window" },
  { value: "weekly", label: "Weekly digest", hint: "One roundup a week" },
] as const;

export const CHANNELS = [
  { value: "email", label: "Email" },
  { value: "telegram", label: "Telegram" },
  { value: "discord", label: "Discord" },
] as const;

export const COUNTRIES = ["Canada", "USA"] as const;

// Delivery windows. Days: 0 = Monday … 6 = Sunday. Hours are local to the
// alert's timezone. Keep in sync with worker/run_alerts.py (WINDOWS).
export const WINDOWS = [
  { value: "weekday_morning", label: "Weekday mornings", detail: "Mon–Fri · 7–9 AM", days: [0, 1, 2, 3, 4], hours: [7, 8] },
  { value: "workday", label: "Workday", detail: "Mon–Fri · 9 AM–5 PM", days: [0, 1, 2, 3, 4], hours: [9, 10, 11, 12, 13, 14, 15, 16] },
  { value: "weeknight", label: "Weeknights", detail: "Mon–Fri · 5–9 PM", days: [0, 1, 2, 3, 4], hours: [17, 18, 19, 20] },
  { value: "weekend_morning", label: "Weekend mornings", detail: "Sat–Sun · 7–10 AM", days: [5, 6], hours: [7, 8, 9] },
  { value: "weekend_day", label: "Weekend daytime", detail: "Sat–Sun · 10 AM–9 PM", days: [5, 6], hours: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] },
  { value: "night_owl", label: "Night owl", detail: "Every day · 9 PM–2 AM", days: [0, 1, 2, 3, 4, 5, 6], hours: [21, 22, 23, 0, 1] },
  { value: "always", label: "Around the clock ☕", detail: "24/7 · for the very caffeinated", days: [0, 1, 2, 3, 4, 5, 6], hours: Array.from({ length: 24 }, (_, i) => i) },
] as const;

export const WINDOW_PRESETS: { label: string; windows: WindowId[] }[] = [
  { label: "Waking hours", windows: ["weekday_morning", "workday", "weeknight", "weekend_morning", "weekend_day"] },
  { label: "Work hours only", windows: ["workday"] },
  { label: "Evenings & weekends", windows: ["weeknight", "weekend_morning", "weekend_day"] },
  { label: "Weekends only", windows: ["weekend_morning", "weekend_day"] },
  { label: "Night owl", windows: ["night_owl"] },
  { label: "24/7 ☕", windows: ["always"] },
];

export const DEFAULT_WINDOWS: WindowId[] = ["workday", "weeknight", "weekend_day"];

export const STATUSES = [
  { value: "new", label: "New" },
  { value: "saved", label: "To apply" },
  { value: "maybe", label: "Maybe" },
  { value: "applied", label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "not_interested", label: "Not interested" },
] as const;

export const ROLE_SUGGESTIONS = [
  "Supply Chain Analyst",
  "Business Analyst",
  "Data Analyst",
  "Program Coordinator",
  "Project Coordinator",
  "Administrative Assistant",
  "IT Support Analyst",
  "HR Coordinator",
  "Procurement Specialist",
  "Marketing Coordinator",
];

export const CITY_SUGGESTIONS = ["Calgary, AB", "Edmonton, AB", "Toronto, ON", "Vancouver, BC", "Montreal, QC", "Ottawa, ON"];

export type WorkMode = (typeof WORK_MODES)[number]["value"];
export type Frequency = (typeof FREQUENCIES)[number]["value"];
export type Channel = (typeof CHANNELS)[number]["value"];
export type WindowId = (typeof WINDOWS)[number]["value"];
export type Status = (typeof STATUSES)[number]["value"];

export function labelFor(list: readonly { value: string; label: string }[], value: string): string {
  return list.find((x) => x.value === value)?.label ?? value;
}
