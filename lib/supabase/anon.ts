import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/config";

// Cookie-less client for server routes that act on no user's behalf
// (the Telegram webhook). It can only call the secret-gated RPCs.
export function createAnonClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
