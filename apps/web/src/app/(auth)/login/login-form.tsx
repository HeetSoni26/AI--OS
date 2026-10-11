"use client";

import { useActionState } from "react";
import { Github, Loader2, LogIn } from "lucide-react";
import { loginAction, oauthAction, type AuthActionState } from "../actions";

const initialState: AuthActionState = { status: "idle" };

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  return (
    <div className="space-y-5">
      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-[#C5C8DB]">Owner email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="auth-input" />
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-[#C5C8DB]">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="auth-input" />
        </div>
        {state.message ? <p role="alert" className={state.status === "success" ? "text-xs text-[#39FF14]" : "text-xs text-[#FF6B2B]"}>{state.message}</p> : null}
        <button type="submit" disabled={pending} className="auth-primary">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <LogIn className="size-4" aria-hidden="true" />}
          Sign in
        </button>
      </form>
      <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-[#888]"><span className="h-px flex-1 bg-[#2A2E45]" />or continue with<span className="h-px flex-1 bg-[#2A2E45]" /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <form action={() => oauthAction("google")}><button className="auth-secondary" type="submit">G Google</button></form>
        <form action={() => oauthAction("github")}><button className="auth-secondary" type="submit"><Github className="size-4" aria-hidden="true" />GitHub</button></form>
      </div>
    </div>
  );
}
