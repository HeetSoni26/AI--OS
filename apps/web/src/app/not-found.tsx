import Link from "next/link";
import { ArrowLeft, MapPinOff } from "lucide-react";

export default function NotFound() {
  return <main className="app-grid flex min-h-screen items-center justify-center px-4"><div className="w-full max-w-lg rounded-2xl border border-[#2A2E45] bg-[#0C1020] p-8 text-center"><span className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full border border-purple-300/30 bg-purple-300/10 text-purple-200"><MapPinOff aria-hidden="true" className="size-5" /></span><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-purple-200">404 / route not found</p><h1 className="mt-3 text-xl font-semibold text-[#F3F5FF]">This workspace route does not exist</h1><p className="mt-2 text-sm leading-6 text-[#888]">The address may be outdated, or this module has not been added.</p><Link href="/dashboard" className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg border border-cyan-300/40 bg-cyan-300 px-4 text-sm font-medium text-[#071014] hover:bg-cyan-200"><ArrowLeft aria-hidden="true" className="size-4" />Back to dashboard</Link></div></main>;
}
