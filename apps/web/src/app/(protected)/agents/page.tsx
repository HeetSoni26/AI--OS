import { Suspense } from "react";
import { AgentsWorkspace } from "@/features/agents/components/agents-workspace";
import { Skeleton } from "@/components/ui";

export default function AgentsPage() {
  return <Suspense fallback={<div role="status" aria-label="Loading agents" className="grid gap-3"><Skeleton className="h-20" /><Skeleton className="h-80" /></div>}><AgentsWorkspace /></Suspense>;
}
