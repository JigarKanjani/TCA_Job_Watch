"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { STATUSES } from "@/lib/config";
import { checkJobUrl, fetchJobDetails } from "@/lib/jd";
import { DEMO_MESSAGE, isDemoEmail } from "@/lib/demo";
import { allow, LIMITED } from "@/lib/ratelimit";
import { cleanOrNull, cleanText, isoDateOrNull, isUuid, multilineOrNull, uuidOrNull } from "@/lib/sanitize";

export type JobFormState = { error?: string; ok?: string };

const validStatus = (s: string) => STATUSES.some((x) => x.value === s);
const clip = cleanOrNull;

export async function quickStatus(form: FormData) {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) redirect("/jobs?flash=demo_readonly");
  const id = cleanText(form.get("id"), 40);
  const status = cleanText(form.get("status"), 30);
  if (!isUuid(id) || !validStatus(status) || !(await allow("writes", user.id))) return;
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
  const id = cleanText(form.get("id"), 40);
  if (!isUuid(id)) return { error: "Job not found." };
  if (!(await allow("writes", user.id))) return { error: LIMITED };
  const status = cleanText(form.get("status"), 30) || "new";
  if (!validStatus(status)) return { error: "Pick a valid stage." };
  const appliedRaw = cleanText(form.get("applied_at"), 20);
  const appliedAt = isoDateOrNull(appliedRaw);
  if (appliedRaw && !appliedAt) return { error: "Applied date isn't valid." };
  const { error } = await supabase
    .from("job_matches")
    .update({
      status,
      applied_at: appliedAt || (["applied", "interviewing", "offer"].includes(status) ? new Date().toISOString().slice(0, 10) : null),
      resume_doc_id: uuidOrNull(form.get("resume_doc_id")),
      cover_doc_id: uuidOrNull(form.get("cover_doc_id")),
      notes: multilineOrNull(form.get("notes"), 10000),
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
  const id = cleanText(form.get("id"), 40);
  if (!isUuid(id)) return { error: "Job not found." };
  if (!(await allow("writes", user.id))) return { error: LIMITED };
  const description = multilineOrNull(form.get("description"), 60000);
  const { error } = await supabase.from("job_matches").update({ description }).eq("id", id);
  if (error) return { error: "Couldn't save the description." };
  revalidatePath(`/jobs/${id}`);
  return { ok: "Description saved." };
}

export async function fetchDescription(_prev: JobFormState, form: FormData): Promise<JobFormState> {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) return { error: DEMO_MESSAGE };
  const id = cleanText(form.get("id"), 40);
  if (!isUuid(id)) return { error: "Job not found." };
  if (!(await allow("fetch_jd", user.id))) return { error: LIMITED };
  const { data: job } = await supabase.from("job_matches").select("job_url, title, company, location, salary").eq("id", id).single();
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
      salary: job.salary ?? d.salary?.slice(0, 120) ?? null,
    })
    .eq("id", id);
  revalidatePath(`/jobs/${id}`);
  return { ok: "Description fetched." };
}

export async function addJob(_prev: JobFormState, form: FormData): Promise<JobFormState> {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) return { error: DEMO_MESSAGE };
  if (!(await allow("add_job", user.id))) return { error: LIMITED };
  const raw = cleanText(form.get("job_url"), 2000);
  const checked = checkJobUrl(raw);
  if (typeof checked === "string") return { error: checked };
  const url = checked.toString();

  const { data: existing } = await supabase.from("job_matches").select("id").eq("job_url", url).maybeSingle();
  if (existing) redirect(`/jobs/${existing.id}`);

  const d = await fetchJobDetails(url);
  const status = cleanText(form.get("status"), 30) || "saved";
  const { data, error } = await supabase
    .from("job_matches")
    .insert({
      job_url: url,
      title: clip(form.get("title"), 300) ?? d.title?.slice(0, 300) ?? null,
      company: clip(form.get("company"), 300) ?? d.company?.slice(0, 300) ?? null,
      location: d.location?.slice(0, 300) ?? null,
      salary: d.salary?.slice(0, 120) ?? null,
      description: d.description?.slice(0, 60000) ?? null,
      site: checked.hostname.replace(/^www\./, "").slice(0, 50),
      status: validStatus(status) ? status : "saved",
      applied_at: status === "applied" ? new Date().toISOString().slice(0, 10) : null,
    })
    .select("id")
    .single();
  if (error?.hint === "rate_limited") return { error: error.message };
  if (error || !data) return { error: "Couldn't add that job. Please try again." };
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  redirect(`/jobs/${data.id}?flash=job_added`);
}

export async function deleteJob(form: FormData) {
  const { supabase, user } = await requireUser();
  if (isDemoEmail(user.email)) redirect("/jobs?flash=demo_readonly");
  const id = cleanText(form.get("id"), 40);
  if (!isUuid(id) || !(await allow("writes", user.id))) redirect("/jobs");
  await supabase.from("job_matches").delete().eq("id", id);
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  redirect("/jobs?flash=job_deleted");
}
