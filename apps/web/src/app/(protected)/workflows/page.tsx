import { Suspense } from "react";
import { WorkflowsWorkspace } from "@/features/workflows/components/workflows-workspace";
import { Skeleton } from "@/components/ui";

export default function WorkflowsPage() {
  return <Suspense fallback={<div role="status" aria-label="Loading workflows" className="grid gap-3"><Skeleton className="h-20" /><Skeleton className="h-80" /></div>}><WorkflowsWorkspace /></Suspense>;
}
