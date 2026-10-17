import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { allow } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// "Download my data": everything JobWatch stores about the signed-in user, as
// JSON. Uploaded files are listed (name, size, date); download them from the
// Documents page.
export async function GET(request: Request) {
  // Only from our own pages (or typed in): other sites can't trigger it.
  if (request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ ok: false }, { status: 403 });
  const { supabase, user } = await requireUser();
  if (!(await allow("export", user.id))) return NextResponse.json({ ok: false, error: "Too many downloads. Try again in an hour." }, { status: 429 });
  const [profile, alerts, jobs, documents, briefs] = await Promise.all([
    supabase.from("profiles").select("email, full_name, telegram_chat_id, discord_webhook_url, plan, search_briefs, base_resume_doc_id, created_at").eq("id", user.id).maybeSingle(),
    supabase.from("alerts").select("*").order("created_at"),
    supabase.from("job_matches").select("*").order("found_at"),
    supabase.from("documents").select("id, kind, name, size_bytes, created_at").order("created_at"),
    supabase.from("scheduled_messages").select("kind, send_at, status, created_at, sent_at").order("created_at"),
  ]);
  const body = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email, created_at: user.created_at, sign_in_methods: user.app_metadata?.providers ?? [] },
    profile: profile.data,
    alerts: alerts.data ?? [],
    job_log: jobs.data ?? [],
    documents: documents.data ?? [],
    search_briefs: briefs.data ?? [],
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="jobwatch-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
