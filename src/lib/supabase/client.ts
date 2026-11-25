import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedBrowserClient: SupabaseClient | null = null;

/**
 * Returns a browser-safe Supabase client using the anon key.
 * Used exclusively to subscribe to the privacy-safe `study_realtime_signals` table.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (cachedBrowserClient) {
    return cachedBrowserClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  cachedBrowserClient = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedBrowserClient;
}
