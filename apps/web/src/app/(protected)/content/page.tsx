import { Suspense } from "react";
import { ContentWorkspace } from "@/features/content/components/content-workspace";
import { Skeleton } from "@/components/ui";

export default function ContentPage() {
  return <Suspense fallback={<div role="status" aria-label="Loading content" className="grid gap-3"><Skeleton className="h-20" /><Skeleton className="h-80" /></div>}><ContentWorkspace /></Suspense>;
}
