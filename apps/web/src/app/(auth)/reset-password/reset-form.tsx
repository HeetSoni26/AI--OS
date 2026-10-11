"use client";

import { useActionState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import Link from "next/link";
import { updatePasswordAction, type AuthActionState } from "../actions";

const initialState: AuthActionState = { status: "idle" };

export function ResetForm() {
  const [state, action, pending] = useActionState(updatePasswordAction, initialState);
  return (
    <>
      <form action={action} className="space-y-4">
        <div><label htmlFor="new-password" className="mb-1.5 block text-xs font-medium text-[#C5C8DB]">New password</label><input id="new-password" name="password" type="password" autoComplete="new-password" required className="auth-input" /></div>
        <div><label htmlFor="confirm-password" className="mb-1.5 block text-xs font-medium text-[#C5C8DB]">Confirm password</label><input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required className="auth-input" /></div>
        <p className="text-[11px] leading-5 text-[#888]">Use at least 8 characters with a letter, number, and special character.</p>
        {state.message ? <p role="status" className={state.status === "success" ? "text-xs text-[#39FF14]" : "text-xs text-[#FF6B2B]"}>{state.message}</p> : null}
        <button type="submit" disabled={pending} className="auth-primary">{pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <KeyRound className="size-4" aria-hidden="true" />}Update password</button>
      </form>
      <Link className="mt-6 block text-xs text-[#00F0FF]" href="/login">Return to sign in</Link>
    </>
  );
}
