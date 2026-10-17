import { NextResponse } from "next/server";
import { renderBrief, type BriefJob } from "@/lib/brief";
import { sendEmail } from "@/lib/notify";
import { safeEqual } from "@/lib/security";
import { createAnonClient } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type DueBrief = {
  id: string;
  created_at: string;
  email: string | null;
  full_name: string | null;
  search_briefs: boolean;
  jobs: (BriefJob & { status: string; windows: string[] | null; timezone: string | null })[];
};

const authorised = (request: Request, secret: string) =>
  safeEqual((request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""), secret);

// Sends search briefs whose delivery window has opened. Called by the
// scheduled worker every 30 minutes with the worker secret.
export async function POST(request: Request) {
  const secret = process.env.WORKER_SECRET;
  if (!secret || !authorised(request, secret)) return NextResponse.json({ ok: false }, { status: 401 });

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("worker_due_briefs", { p_secret: secret });
  if (error) return NextResponse.json({ ok: false, error: "rpc failed" }, { status: 500 });

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin).replace(/\/$/, "");
  const counts = { sent: 0, cancelled: 0, retry: 0 };
  for (const b of (data ?? []) as DueBrief[]) {
    // Only jobs still waiting to be sorted; anything already swiped was seen.
    const jobs = b.jobs.filter((j) => j.status === "new");
    let status: "sent" | "cancelled" | "retry" = "cancelled";
    let note: string | null = !b.search_briefs ? "briefs turned off" : !b.email ? "no email" : !jobs.length ? "already sorted" : null;
    if (!note) {
      const brief = renderBrief({
        name: b.full_name,
        jobs,
        searchedAt: new Date(b.created_at),
        sentAt: new Date(),
        timezone: jobs[0].timezone,
        windows: jobs[0].windows ?? [],
        site,
      });
      const r = await sendEmail(b.email!, brief.subject, brief.html, brief.text);
      status = r.ok ? "sent" : "retry";
      note = r.ok ? null : r.error;
    }
    await supabase.rpc("worker_finish_brief", { p_secret: secret, p_id: b.id, p_status: status, p_error: note });
    counts[status]++;
  }
  return NextResponse.json({ ok: true, ...counts });
}
