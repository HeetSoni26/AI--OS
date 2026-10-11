import { Suspense } from "react";
import { ReportsWorkspace } from "@/features/reports/components/reports-workspace";
import { Skeleton } from "@/components/ui";

export default function ReportsPage() {
  return <Suspense fallback={<div role="status" aria-label="Loading reports" className="grid gap-3"><Skeleton className="h-20" /><Skeleton className="h-80" /></div>}><ReportsWorkspace /></Suspense>;
}
