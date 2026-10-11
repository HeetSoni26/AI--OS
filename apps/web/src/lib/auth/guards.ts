import "server-only";

import { redirect } from "next/navigation";
import { getServerEnv, isSupabaseConfigured } from "@/lib/config/env";
import { isActiveRegisteredOwner } from "@/lib/auth/owner-registry";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OwnerIdentity = { id: string; email: string; displayName: string };

export async function getOwner(accessToken?: string): Promise<OwnerIdentity | null> {
  const env = getServerEnv();
  if (env.AIOS_AUTH_BYPASS === "development-shell" && process.env.NODE_ENV !== "production") {
    return { id: "development-owner", email: env.AIOS_OWNER_EMAIL ?? "owner@local.aios", displayName: "Agency Owner" };
  }
  if (!isSupabaseConfigured()) return null;
  if (process.env.NODE_ENV === "production" && !env.AIOS_OWNER_EMAIL) return null;
  const client = await createSupabaseServerClient();
  const { data, error } = await client!.auth.getUser(accessToken);
  if (error || !data.user?.email) return null;
  if (env.AIOS_OWNER_EMAIL && data.user.email.toLowerCase() !== env.AIOS_OWNER_EMAIL.toLowerCase()) return null;
  if (!(await isActiveRegisteredOwner(data.user.id, data.user.email))) return null;
  return {
    id: data.user.id,
    email: data.user.email,
    displayName: String(data.user.user_metadata?.full_name ?? data.user.email.split("@")[0] ?? "Agency Owner"),
  };
}

export async function requireOwner(): Promise<OwnerIdentity> {
  const owner = await getOwner();
  if (!owner) redirect(`/login?next=/dashboard${isSupabaseConfigured() ? "" : "&reason=configuration"}`);
  return owner;
}
