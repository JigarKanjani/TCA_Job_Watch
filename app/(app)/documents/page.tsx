import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { entitlementsFor } from "@/lib/plans";
import { shortDate } from "@/lib/format";
import type { DocumentRow } from "@/lib/types";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { deleteDocument } from "./actions";
import { Uploader } from "./Uploader";

export const metadata: Metadata = { title: "Documents" };

function kb(n: number | null) {
  if (!n) return "";
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ flash?: string }> }) {
  const { flash } = await searchParams;
  const { supabase, user, profile } = await requireProfile();
  const ent = entitlementsFor(profile?.plan);
  const [{ data: docs }, { data: uses }] = await Promise.all([
    supabase.from("documents").select("*").order("created_at", { ascending: false }).returns<DocumentRow[]>(),
    supabase.from("job_matches").select("resume_doc_id, cover_doc_id"),
  ]);
  const list = docs ?? [];
  const usedBy = new Map<string, number>();
  for (const u of uses ?? []) {
    for (const k of [u.resume_doc_id, u.cover_doc_id]) if (k) usedBy.set(k, (usedBy.get(k) ?? 0) + 1);
  }
  const groups = [
    { title: "Resumes", items: list.filter((d) => d.kind === "resume") },
    { title: "Cover letters", items: list.filter((d) => d.kind === "cover_letter") },
  ];

  return (
    <>
      <Flash code={flash} />
      <div className="page-head">
        <div>
          <span className="eyebrow">{list.length} of {ent.maxDocuments} documents</span>
          <h1>Resumes &amp; cover letters</h1>
        </div>
      </div>
      <div className="dash-grid">
        <div className="stack">
          {groups.map((g) => (
            <div key={g.title} className="panel">
              <span className="eyebrow">{g.title}</span>
              {g.items.length === 0 ? (
                <p className="muted small" style={{ marginTop: 10 }}>None yet. Upload one to track which version you send where.</p>
              ) : (
                <ul className="doc-list">
                  {g.items.map((d) => (
                    <li key={d.id}>
                      <div className="info">
                        <b>{d.name}</b>
                        <span className="small muted">
                          {shortDate(d.created_at)} · {kb(d.size_bytes)} · used for {usedBy.get(d.id) ?? 0} application{(usedBy.get(d.id) ?? 0) === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="row">
                        <a className="btn btn-outline btn-sm" href={`/documents/${d.id}/download`}>Download</a>
                        <form action={deleteDocument}>
                          <input type="hidden" name="id" value={d.id} />
                          <SubmitButton className="btn btn-ghost btn-sm" pendingText="…">Delete</SubmitButton>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        <Uploader userId={user.id} remaining={ent.maxDocuments - list.length} />
      </div>
    </>
  );
}
