import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/config/env";

export function createSupabaseAdminClient() {
  const env = getServerEnv();
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !key) throw new Error("Supabase admin credentials are not configured.");
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
