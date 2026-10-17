import { NextResponse } from "next/server";
import { payView } from "@/lib/pay/estimate";

// Pay labels for a batch of jobs (posted pay, or an estimate from public wage
// data). Used by the alert worker, which can't run the TypeScript estimator.
// Holds no user data, so it needs no sign-in; batches are capped.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { jobs?: unknown } | null;
  const jobs = Array.isArray(body?.jobs) ? body.jobs.slice(0, 60) : [];
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);
  const pay = jobs.map((j) => {
    const o = (j ?? {}) as Record<string, unknown>;
    return payView({
      title: str(o.title, 300),
      location: str(o.location, 300),
      salary: str(o.salary, 120),
      pay_hint: str(o.pay_hint, 400),
      country: str(o.country, 20),
    });
  });
  return NextResponse.json({ pay });
}
