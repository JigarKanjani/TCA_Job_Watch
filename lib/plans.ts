// Plans & entitlements — the single place the future paywall plugs into.
//
// How the paywall will work:
//   1. A checkout route creates a Stripe (or similar) session for the user.
//   2. The billing webhook sets profiles.plan / plan_status / plan_renews_at /
//      billing_customer_id (users cannot write these columns themselves).
//   3. Flip BETA_ALL_FEATURES to false. Feature checks below start applying
//      per-plan limits, and the database alert cap is raised/lowered with:
//        update private.app_config set value = '3' where key = 'alert_limit_free';
//
// Every feature gate in the app goes through `entitlementsFor` — never check
// `plan === "pro"` inline.

export type Plan = "free" | "pro";

export const BETA_ALL_FEATURES = true;

export type Entitlements = {
  label: string;
  maxDocuments: number;
  jdFetchesPerDay: number;
  instantAlerts: boolean;
  aroundTheClock: boolean;
};

const PLANS: Record<Plan, Entitlements> = {
  free: {
    label: "Free",
    maxDocuments: 5,
    jdFetchesPerDay: 10,
    instantAlerts: false,
    aroundTheClock: false,
  },
  pro: {
    label: "Pro",
    maxDocuments: 50,
    jdFetchesPerDay: 200,
    instantAlerts: true,
    aroundTheClock: true,
  },
};

export function entitlementsFor(plan: string | null | undefined): Entitlements {
  const p: Plan = plan === "pro" ? "pro" : "free";
  if (BETA_ALL_FEATURES) return { ...PLANS.pro, label: p === "pro" ? "Pro" : "Beta (all features)" };
  return PLANS[p];
}

export const PRICING = {
  free: { name: "Free", price: "$0", blurb: "Everything you need to stop refreshing job boards." },
  pro: { name: "Pro", price: "Coming soon", blurb: "Instant alerts, 24/7 windows, a bigger document library." },
};
