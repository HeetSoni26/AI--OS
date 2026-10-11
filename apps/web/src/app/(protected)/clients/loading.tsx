import { Skeleton } from "@/components/ui";

export default function ClientsLoading() {
  return <div role="status" aria-label="Loading client operations" className="grid gap-4"><Skeleton className="h-24" /><Skeleton className="h-12" /><Skeleton className="h-80" /></div>;
}
