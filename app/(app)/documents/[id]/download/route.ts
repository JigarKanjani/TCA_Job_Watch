import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { originFrom } from "@/lib/redirect";

// Hands back a 60-second signed link to the user's own file.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getUser();
  const origin = originFrom(request);
  if (!supabase || !user) return NextResponse.redirect(`${origin}/login`);
  const { data: doc } = await supabase.from("documents").select("storage_path, name").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.redirect(`${origin}/documents`);
  const { data } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 60, { download: doc.name });
  if (!data?.signedUrl) return NextResponse.redirect(`${origin}/documents`);
  return NextResponse.redirect(data.signedUrl);
}
