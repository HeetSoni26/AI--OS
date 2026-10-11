import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerEnv, isSupabaseConfigured } from "@/lib/config/env";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!isSupabaseConfigured() || !code) return NextResponse.redirect(new URL("/login?error=Authentication%20callback%20is%20invalid.", url));
  const client = await createSupabaseServerClient();
  const { data, error } = await client!.auth.exchangeCodeForSession(code);
  if (error || !data.user.email) return NextResponse.redirect(new URL("/login?error=Authentication%20could%20not%20be%20completed.", url));
  const ownerEmail = getServerEnv().AIOS_OWNER_EMAIL;
  if (ownerEmail && data.user.email.toLowerCase() !== ownerEmail.toLowerCase()) {
    await client!.auth.signOut();
    return NextResponse.redirect(new URL("/unauthorized", url));
  }
  return NextResponse.redirect(new URL("/dashboard", url));
}
