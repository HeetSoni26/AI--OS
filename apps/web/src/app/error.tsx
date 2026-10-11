"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Route error", error); }, [error]);
  return <main className="app-grid flex min-h-screen items-center justify-center px-4"><div role="alert" className="w-full max-w-lg rounded-2xl border border-red-400/30 bg-[#0C1020] p-8 text-center"><span className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full border border-red-400/30 bg-red-400/10 text-red-300"><AlertTriangle aria-hidden="true" className="size-5" /></span><h1 className="text-xl font-semibold text-[#F3F5FF]">This page could not load</h1><p className="mt-2 text-sm leading-6 text-[#888]">The error was isolated to this route. Try again without leaving the workspace.</p><Button className="mt-6" onClick={reset}><RotateCcw aria-hidden="true" className="size-4" />Try again</Button></div></main>;
}
