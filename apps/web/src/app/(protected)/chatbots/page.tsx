import { Suspense } from "react";
import { ChatbotsWorkspace } from "@/features/chatbots/components/chatbots-workspace";
import { Skeleton } from "@/components/ui";

export default function ChatbotsPage() {
  return <Suspense fallback={<div role="status" aria-label="Loading chatbots" className="grid gap-3"><Skeleton className="h-20" /><Skeleton className="h-80" /></div>}><ChatbotsWorkspace /></Suspense>;
}
