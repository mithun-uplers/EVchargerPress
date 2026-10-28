import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Cookie-less client for machine callers (charger gateways). Only reaches RPCs that verify their own credentials. */
export function createAnonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
