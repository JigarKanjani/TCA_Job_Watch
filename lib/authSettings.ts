import "server-only";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

// Which sign-in methods are switched on in Supabase. Cached for 5 minutes,
// so enabling Google in the Supabase dashboard shows the button automatically.
export async function getAuthSettings(): Promise<{ google: boolean; email: boolean }> {
  if (!isSupabaseConfigured) return { google: false, email: false };
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_KEY },
      next: { revalidate: 300 },
    });
    if (!res.ok) return { google: false, email: true };
    const body = (await res.json()) as { external?: Record<string, boolean> };
    return { google: Boolean(body.external?.google), email: body.external?.email !== false };
  } catch {
    return { google: false, email: true };
  }
}
