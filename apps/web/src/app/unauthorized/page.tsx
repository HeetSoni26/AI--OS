import Link from "next/link";

export default function UnauthorizedPage() {
  return <main className="grid min-h-screen place-items-center bg-[#07080F] p-6 text-center"><div><p className="eyebrow">403 · Owner access only</p><h1 className="mt-4 text-3xl font-semibold text-[#F3F5FF]">This workspace is private.</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#888]">The AI Automation Agency OS is restricted to its configured owner account.</p><Link className="mt-8 inline-flex rounded-lg border border-[#2A2E45] px-4 py-2 text-sm text-[#C5C8DB] hover:border-[#00F0FF]/50" href="/login">Return to sign in</Link></div></main>;
}
