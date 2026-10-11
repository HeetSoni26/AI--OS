"use client";

import { useEffect } from "react";
import { AlertOctagon, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Application error", error); }, [error]);
  return <html lang="en"><body className="bg-[#07080F] text-[#C5C8DB]"><main className="flex min-h-screen items-center justify-center px-4"><div role="alert" className="w-full max-w-lg rounded-2xl border border-red-400/30 bg-[#0C1020] p-8 text-center"><AlertOctagon aria-hidden="true" className="mx-auto mb-5 size-8 text-red-300" /><h1 className="text-xl font-semibold text-[#F3F5FF]">AI OS needs to restart this view</h1><p className="mt-2 text-sm leading-6 text-[#888]">A root-level interface error occurred. Your data was not changed by this screen.</p><Button className="mt-6" onClick={reset}><RotateCcw aria-hidden="true" className="size-4" />Restart view</Button></div></main></body></html>;
}
