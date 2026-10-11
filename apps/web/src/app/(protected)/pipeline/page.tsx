import { Suspense } from "react";
import { PipelineWorkspace } from "@/features/pipeline/components/pipeline-workspace";
import { Skeleton } from "@/components/ui";

export default function PipelinePage() {
  return <Suspense fallback={<div role="status" aria-label="Loading pipeline" className="grid gap-3"><Skeleton className="h-20" /><Skeleton className="h-80" /></div>}><PipelineWorkspace /></Suspense>;
}
