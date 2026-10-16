"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ACCEPT = ".pdf,.doc,.docx,.txt";
const MAX_BYTES = 5 * 1024 * 1024;

export function Uploader({ userId, remaining, demo = false }: { userId: string; remaining: number; demo?: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"resume" | "cover_letter">("resume");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [picked, setPicked] = useState<File | null>(null);

  function pick(file: File | undefined | null) {
    setError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) return setError("That file is over 5 MB. Try a PDF export.");
    if (!/\.(pdf|docx?|txt)$/i.test(file.name)) return setError("Upload a PDF, Word document, or text file.");
    setPicked(file);
    if (!name) setName(file.name.replace(/\.[^.]+$/, "").slice(0, 120));
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (demo) return setError("This is the read-only demo. Create your own free account to upload documents.");
    if (!picked) return setError("Choose a file first.");
    if (remaining <= 0) return setError("You've reached your document limit. Delete one to upload another.");
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const safe = picked.name.replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `${userId}/${crypto.randomUUID()}-${safe}`;
    const up = await supabase.storage.from("documents").upload(path, picked, { contentType: picked.type || undefined, upsert: false });
    if (up.error) {
      setBusy(false);
      return setError(`Upload failed: ${up.error.message}`);
    }
    const ins = await supabase.from("documents").insert({ kind, name: (name || picked.name).slice(0, 120), storage_path: path, size_bytes: picked.size });
    setBusy(false);
    if (ins.error) {
      await supabase.storage.from("documents").remove([path]);
      return setError("Couldn't save that document. Please try again.");
    }
    setPicked(null);
    setName("");
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  return (
    <form className="panel stack" onSubmit={upload}>
      <span className="eyebrow">Upload</span>
      <div className="seg" role="group" aria-label="Document type">
        <button type="button" aria-pressed={kind === "resume"} onClick={() => setKind("resume")}>Resume</button>
        <button type="button" aria-pressed={kind === "cover_letter"} onClick={() => setKind("cover_letter")}>Cover letter</button>
      </div>
      <label
        className={`dropzone ${dragging ? "on" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); }}
      >
        <input ref={fileRef} type="file" accept={ACCEPT} onChange={(e) => pick(e.target.files?.[0])} className="sr-only" />
        <b>{picked ? picked.name : "Drop a file here or click to choose"}</b>
        <span className="small muted">PDF, Word or text · up to 5 MB</span>
      </label>
      <div className="field">
        <label htmlFor="doc-name">Name it so you can tell versions apart</label>
        <input id="doc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Resume — Supply Chain v3" maxLength={120} />
      </div>
      {error && <p className="notice notice-err" role="alert">{error}</p>}
      <button className="btn btn-accent" type="submit" disabled={busy || !picked}>{busy ? "Uploading…" : "Upload"}</button>
    </form>
  );
}
