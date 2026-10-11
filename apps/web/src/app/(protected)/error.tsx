"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ProtectedRouteError({ error: _error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section role="alert" className="mx-auto max-w-xl rounded-2xl border border-orange-400/30 bg-[#0C1020] p-8 text-center"><AlertTriangle aria-hidden="true" className="mx-auto mb-4 size-6 text-orange-300" /><h1 className="text-lg font-semibold text-[#F3F5FF]">This workspace view is unavailable</h1><p className="mt-2 text-sm text-[#888]">The application shell is still available. Retry this route when you are ready.</p><Button className="mt-5" onClick={reset}><RotateCcw aria-hidden="true" className="size-4" />Retry view</Button></section>;
}
