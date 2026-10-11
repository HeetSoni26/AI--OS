import { Suspense } from "react";
import { ClientWorkspace } from "@/features/clients/components/client-workspace";
import { Skeleton } from "@/components/ui";

export default function ClientsPage() {
  return <Suspense fallback={<div role="status" aria-label="Loading clients" className="grid gap-3"><Skeleton className="h-20" /><Skeleton className="h-80" /></div>}><ClientWorkspace /></Suspense>;
}
