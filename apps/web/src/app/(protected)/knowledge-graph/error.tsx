"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";

export default function KnowledgeGraphError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section role="alert" className="flex min-h-full w-full flex-1 items-center justify-center bg-[#07080F] p-6 text-center">
      <div className="max-w-md rounded-2xl border border-orange-400/30 bg-[#0C1020] p-6">
        <AlertTriangle aria-hidden="true" className="mx-auto mb-4 size-6 text-orange-300" />
        <h1 className="text-lg font-semibold text-[#F3F5FF]">Knowledge graph unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-[#888]">The application shell remains available. Retry the graph route to reload its interactive workspace.</p>
        <Button className="mt-5" onClick={reset}><RotateCcw aria-hidden="true" className="size-4" />Retry graph</Button>
      </div>
    </section>
  );
}
