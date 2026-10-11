"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv, isSupabaseConfigured } from "@/lib/config/public-env";

export function createSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) return null;
  const env = getPublicEnv();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
