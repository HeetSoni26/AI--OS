import Link from "next/link";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string; error?: string }> }) {
  const params = await searchParams;
  return (
    <div className="auth-card">
      <div className="mb-8"><p className="eyebrow">Private workspace</p><h2 className="mt-3 text-2xl font-semibold text-[#F3F5FF]">Welcome back</h2><p className="mt-2 text-sm leading-6 text-[#888]">Sign in to continue to your agency command center.</p></div>
      {params.reason === "configuration" ? <div className="mb-5 rounded-xl border border-[#FF6B2B]/30 bg-[#FF6B2B]/10 p-3 text-xs leading-5 text-[#FFB38E]" role="status">Supabase Auth is not configured in this environment. Add the values from <code>apps/web/.env.example</code> to enable sign-in.</div> : null}
      {params.error ? <div className="mb-5 rounded-xl border border-[#FF6B2B]/30 bg-[#FF6B2B]/10 p-3 text-xs text-[#FFB38E]" role="alert">{params.error}</div> : null}
      <LoginForm />
      <div className="mt-6 flex justify-between text-xs"><Link className="text-[#00F0FF] transition-colors hover:text-[#8BFAFF]" href="/forgot-password">Forgot password?</Link><span className="text-[#888]">SRS-AIOS-2026-001</span></div>
    </div>
  );
}
