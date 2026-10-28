import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client with the service-role key, for the Auth admin API only (create users,
 * change email or password). Server-only: never import this from a client component and
 * never expose SUPABASE_SERVICE_ROLE_KEY with a NEXT_PUBLIC_ prefix. Callers must check
 * the admin role first (requireAdmin) — this client bypasses row level security.
 */
export function serviceConfigured() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
