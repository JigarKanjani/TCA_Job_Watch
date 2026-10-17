import { NextResponse } from "next/server";
import { payView } from "@/lib/pay/estimate";
import { allow, ipKeyFrom } from "@/lib/ratelimit";
import { safeEqual } from "@/lib/security";

// Pay labels for a batch of jobs (posted pay, or an estimate from public wage
// data). Used by the alert worker, which can't run the TypeScript estimator.
// Holds no user data, so it needs no sign-in; batches and callers are capped.
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 200_000) return NextResponse.json({ pay: [] }, { status: 413 });
  const worker = Boolean(process.env.WORKER_SECRET) && safeEqual(request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""), process.env.WORKER_SECRET!);
  if (!worker && !(await allow("pay_api", ipKeyFrom(request.headers)))) return NextResponse.json({ pay: [] }, { status: 429 });
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
