import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv, isSupabaseConfigured } from "@/lib/config/env";

export async function createSupabaseServerClient() {
  if (!isSupabaseConfigured()) return null;
  const env = getPublicEnv();
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, { ...options, sameSite: "lax", secure: process.env.NODE_ENV === "production" }));
        } catch {
          // Server Components cannot always mutate cookies; Proxy refreshes sessions.
        }
      },
    },
  });
}
