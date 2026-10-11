import { Suspense } from "react";
import { FinanceWorkspace } from "@/features/finance/components/finance-workspace";
import { Skeleton } from "@/components/ui";

export default function FinancePage() {
  return <Suspense fallback={<div role="status" aria-label="Loading finance" className="grid gap-3"><Skeleton className="h-20" /><Skeleton className="h-80" /></div>}><FinanceWorkspace /></Suspense>;
}
