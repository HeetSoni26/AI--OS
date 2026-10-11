import { Suspense } from "react";
import { KnowledgeWorkspace } from "@/features/knowledge/components/knowledge-workspace";
import { Skeleton } from "@/components/ui";

export default function KnowledgeBasePage() {
  return <Suspense fallback={<div role="status" aria-label="Loading knowledge base" className="grid gap-3"><Skeleton className="h-20" /><Skeleton className="h-80" /></div>}><KnowledgeWorkspace /></Suspense>;
}
