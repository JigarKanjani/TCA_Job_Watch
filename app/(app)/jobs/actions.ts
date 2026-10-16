"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { STATUSES } from "@/lib/config";
import { checkJobUrl, fetchJobDetails } from "@/lib/jd";
import { DEMO_MESSAGE, isDemoEmail } from "@/lib/demo";

export type JobFormState = { error?: string; ok?: string };

const validStatus = (s: string) => STATUSES.some((x) => x.value === s);
const clip = (v: FormDataEntryValue | null, n: number) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, n) : null;
};

export async function quickStatus(form: FormData) {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) redirect("/jobs?flash=demo_readonly");
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "");
  if (!validStatus(status)) return;
  const patch: Record<string, unknown> = { status };
  // Stamp the applied date the first time a job reaches a post-application stage.
  if (["applied", "interviewing", "offer"].includes(status)) {
    const { data } = await supabase.from("job_matches").select("applied_at").eq("id", id).single();
    if (!data?.applied_at) patch.applied_at = new Date().toISOString().slice(0, 10);
  }
  await supabase.from("job_matches").update(patch).eq("id", id);
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  revalidatePath("/dashboard");
}

export async function updateTracker(_prev: JobFormState, form: FormData): Promise<JobFormState> {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) return { error: DEMO_MESSAGE };
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "new");
  if (!validStatus(status)) return { error: "Pick a valid stage." };
  const appliedAt = String(form.get("applied_at") ?? "");
  if (appliedAt && !/^\d{4}-\d{2}-\d{2}$/.test(appliedAt)) return { error: "Applied date isn't valid." };
  const { error } = await supabase
    .from("job_matches")
    .update({
      status,
      applied_at: appliedAt || (["applied", "interviewing", "offer"].includes(status) ? new Date().toISOString().slice(0, 10) : null),
      resume_doc_id: clip(form.get("resume_doc_id"), 40),
      cover_doc_id: clip(form.get("cover_doc_id"), 40),
      notes: clip(form.get("notes"), 10000),
      title: clip(form.get("title"), 300),
      company: clip(form.get("company"), 300),
      location: clip(form.get("location"), 300),
      salary: clip(form.get("salary"), 120),
    })
    .eq("id", id);
  if (error) return { error: "Couldn't save. Please try again." };
  revalidatePath(`/jobs/${id}`);
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  return { ok: "Saved." };
}

export async function saveDescription(_prev: JobFormState, form: FormData): Promise<JobFormState> {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) return { error: DEMO_MESSAGE };
  const id = String(form.get("id") ?? "");
  const description = clip(form.get("description"), 60000);
  const { error } = await supabase.from("job_matches").update({ description }).eq("id", id);
  if (error) return { error: "Couldn't save the description." };
  revalidatePath(`/jobs/${id}`);
  return { ok: "Description saved." };
}

export async function fetchDescription(_prev: JobFormState, form: FormData): Promise<JobFormState> {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) return { error: DEMO_MESSAGE };
  const id = String(form.get("id") ?? "");
  const { data: job } = await supabase.from("job_matches").select("job_url, title, company, location").eq("id", id).single();
  if (!job) return { error: "Job not found." };
  const d = await fetchJobDetails(job.job_url);
  if (!d.description) return { error: d.error ?? "No description found on that page. Paste it instead." };
  await supabase
    .from("job_matches")
    .update({
      description: d.description.slice(0, 60000),
      title: job.title ?? d.title?.slice(0, 300) ?? null,
      company: job.company ?? d.company?.slice(0, 300) ?? null,
      location: job.location ?? d.location?.slice(0, 300) ?? null,
    })
    .eq("id", id);
  revalidatePath(`/jobs/${id}`);
  return { ok: "Description fetched." };
}

export async function addJob(_prev: JobFormState, form: FormData): Promise<JobFormState> {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) return { error: DEMO_MESSAGE };
  const raw = String(form.get("job_url") ?? "");
  const checked = checkJobUrl(raw);
  if (typeof checked === "string") return { error: checked };
  const url = checked.toString();

  const { data: existing } = await supabase.from("job_matches").select("id").eq("job_url", url).maybeSingle();
  if (existing) redirect(`/jobs/${existing.id}`);

  const d = await fetchJobDetails(url);
  const status = String(form.get("status") ?? "saved");
  const { data, error } = await supabase
    .from("job_matches")
    .insert({
      job_url: url,
      title: clip(form.get("title"), 300) ?? d.title?.slice(0, 300) ?? null,
      company: clip(form.get("company"), 300) ?? d.company?.slice(0, 300) ?? null,
      location: d.location?.slice(0, 300) ?? null,
      description: d.description?.slice(0, 60000) ?? null,
      site: checked.hostname.replace(/^www\./, "").slice(0, 50),
      status: validStatus(status) ? status : "saved",
      applied_at: status === "applied" ? new Date().toISOString().slice(0, 10) : null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't add that job. Please try again." };
  void user;
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  redirect(`/jobs/${data.id}?flash=job_added`);
}

export async function deleteJob(form: FormData) {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) redirect("/jobs?flash=demo_readonly");
  const id = String(form.get("id") ?? "");
  await supabase.from("job_matches").delete().eq("id", id);
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  redirect("/jobs?flash=job_deleted");
}
