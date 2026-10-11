"use client";

import { useActionState } from "react";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { requestPasswordReset, type AuthActionState } from "../actions";

const initialState: AuthActionState = { status: "idle" };

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initialState);
  return <>
    <form action={action} className="space-y-4">
      <div><label htmlFor="reset-email" className="mb-1.5 block text-xs font-medium text-[#C5C8DB]">Owner email</label><input id="reset-email" name="email" type="email" autoComplete="email" required className="auth-input" /></div>
      {state.message ? <p role="status" className={state.status === "success" ? "text-xs text-[#39FF14]" : "text-xs text-[#FF6B2B]"}>{state.message}</p> : null}
      <button type="submit" disabled={pending} className="auth-primary">{pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Mail className="size-4" aria-hidden="true" />}Send reset link</button>
    </form>
    <Link className="mt-6 flex items-center gap-2 text-xs text-[#888] transition-colors hover:text-[#F3F5FF]" href="/login"><ArrowLeft className="size-3" aria-hidden="true" />Back to sign in</Link>
  </>;
}
