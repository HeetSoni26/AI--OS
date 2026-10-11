import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("skeleton-shimmer rounded-lg", className)} {...props} />;
}

export function LoadingRegion({ label = "Loading" }: { label?: string }) {
  return <div role="status" aria-live="polite" aria-label={label} className="flex items-center gap-2 text-xs text-[#888]"><span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-cyan-300" />{label}<span className="sr-only">, please wait</span></div>;
}
