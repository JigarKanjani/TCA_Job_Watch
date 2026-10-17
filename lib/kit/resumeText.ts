import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Pulls plain text out of a resume in the user's private document library.
// PDF → unpdf (serverless build of PDF.js), Word → mammoth, text as-is.

const MAX_CHARS = 30000;

export async function documentText(
  supabase: SupabaseClient,
  docId: string,
): Promise<{ name: string; text: string } | { error: string }> {
  const { data: doc } = await supabase.from("documents").select("name, storage_path").eq("id", docId).maybeSingle();
  if (!doc) return { error: "That document isn't in your library any more." };
  const path = doc.storage_path as string;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "doc") return { error: "Older .doc files can't be read. Save your resume as .docx or PDF and upload it again." };

  const { data: blob, error } = await supabase.storage.from("documents").download(path);
  if (error || !blob) return { error: "Couldn't open that document. Try again in a moment." };
  const buf = new Uint8Array(await blob.arrayBuffer());

  try {
    let text = "";
    if (ext === "pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(buf);
      const out = await extractText(pdf, { mergePages: true });
      text = Array.isArray(out.text) ? out.text.join("\n") : out.text;
    } else if (ext === "docx") {
      const mammoth = await import("mammoth");
      text = (await mammoth.extractRawText({ buffer: Buffer.from(buf) })).value;
    } else {
      text = new TextDecoder().decode(buf);
    }
    text = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (text.length < 80) return { error: "That file has almost no readable text (it may be a scanned image). Upload a text-based PDF or Word file." };
    return { name: doc.name as string, text: text.slice(0, MAX_CHARS) };
  } catch {
    return { error: "Couldn't read that file. Try uploading it as a PDF or .docx." };
  }
}
