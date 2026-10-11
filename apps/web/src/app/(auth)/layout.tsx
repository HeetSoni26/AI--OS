import { Cpu, Network, ShieldCheck } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <a className="skip-link" href="#auth-content">Skip to authentication</a>
      <section className="auth-brand" aria-labelledby="auth-brand-title">
        <div className="auth-brand-content">
          <div className="flex items-center gap-3 text-[#00F0FF]"><span className="grid size-10 place-items-center rounded-xl border border-[#00F0FF]/30 bg-[#00F0FF]/10"><Network aria-hidden="true" /></span><span className="font-mono text-xs tracking-[0.28em]">AI AGENCY OS</span></div>
          <h1 id="auth-brand-title" className="mt-12 max-w-xl text-4xl font-semibold leading-tight text-[#F3F5FF] sm:text-6xl">Your agency.<br /><span className="text-[#00F0FF]">One command center.</span></h1>
          <p className="mt-6 max-w-lg text-sm leading-7 text-[#888]">A private, AI-powered operating system for clients, agents, delivery, finance, and institutional knowledge.</p>
          <ul className="mt-10 grid gap-4 text-xs text-[#C5C8DB] sm:grid-cols-3">
            <li className="auth-feature"><Cpu aria-hidden="true" />AI workforce</li><li className="auth-feature"><Network aria-hidden="true" />Live business graph</li><li className="auth-feature"><ShieldCheck aria-hidden="true" />Owner-only access</li>
          </ul>
        </div>
      </section>
      <section id="auth-content" className="auth-content">{children}</section>
    </main>
  );
}
