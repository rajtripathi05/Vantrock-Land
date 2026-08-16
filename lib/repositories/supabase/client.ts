/**
 * Supabase browser client.
 *
 * Uses the anon key only — safe to ship to the browser, protected by the RLS
 * policies in supabase/migrations/0001_init.sql. The service/secret key is
 * NEVER imported here or anywhere under app/; see docs/SECURITY.md.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set to use the " +
        "supabase persistence driver. See docs/MANUAL_ACTIONS.md.",
    );
  }

  client = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return client;
}

/** Test-only: inject a fake client instead of building a real one. */
export function setSupabaseClientForTests(fake: SupabaseClient | null): void {
  client = fake;
}
