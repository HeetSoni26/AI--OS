"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPublicEnv, isSupabaseConfigured } from "@/lib/config/env";
import { enforceLoginLimit } from "@/lib/ratelimit/login";
import { emailSchema, loginSchema, resetPasswordSchema } from "@/lib/auth/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { log } from "@/lib/observability/logger";

export type AuthActionState = { status: "idle" | "error" | "success"; message?: string; retryAfterSeconds?: number };

function configuredError(): AuthActionState {
  return { status: "error", message: "Authentication is not configured. Add the Supabase environment values before signing in." };
}

export async function loginAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) return configuredError();
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check your credentials." };
  const headerStore = await headers();
  const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headerStore.get("x-real-ip") ?? "unknown";
  const limit = await enforceLoginLimit(ip);
  if (!limit.allowed) return { status: "error", message: "Too many sign-in attempts. Try again later.", retryAfterSeconds: limit.retryAfterSeconds };
  const client = await createSupabaseServerClient();
  const { error } = await client!.auth.signInWithPassword(parsed.data);
  if (error) {
    log("warn", "Owner sign-in failed", { ip, email: parsed.data.email, reason: error.code });
    return { status: "error", message: "The email or password is incorrect.", retryAfterSeconds: limit.retryAfterSeconds };
  }
  redirect("/dashboard");
}

export async function oauthAction(provider: "google" | "github") {
  if (!isSupabaseConfigured()) redirect("/login?reason=configuration");
  const client = await createSupabaseServerClient();
  const env = getPublicEnv();
  const { data, error } = await client!.auth.signInWithOAuth({ provider, options: { redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback` } });
  if (error || !data.url) redirect(`/login?error=${encodeURIComponent("OAuth sign-in could not start.")}`);
  redirect(data.url);
}

export async function requestPasswordReset(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) return configuredError();
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { status: "error", message: email.error.issues[0]?.message };
  const client = await createSupabaseServerClient();
  const { error } = await client!.auth.resetPasswordForEmail(email.data, { redirectTo: `${getPublicEnv().NEXT_PUBLIC_APP_URL}/reset-password` });
  if (error) return { status: "error", message: "Password reset could not be requested." };
  return { status: "success", message: "If the owner account exists, a reset link has been sent." };
}

export async function updatePasswordAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) return configuredError();
  const parsed = resetPasswordSchema.safeParse({ password: formData.get("password"), confirmPassword: formData.get("confirmPassword") });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };
  const client = await createSupabaseServerClient();
  const { error } = await client!.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", message: "The password could not be updated." };
  await client!.auth.signOut({ scope: "others" });
  return { status: "success", message: "Password updated. Other sessions were invalidated." };
}

export async function logoutAction() {
  const client = await createSupabaseServerClient();
  if (client) await client.auth.signOut();
  redirect("/login");
}
