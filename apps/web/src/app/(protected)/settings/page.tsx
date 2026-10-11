import { Suspense } from "react";
import { SettingsWorkspace } from "@/features/settings/components/settings-workspace";
import { Skeleton } from "@/components/ui";

export default function SettingsPage() {
  return <Suspense fallback={<div role="status" aria-label="Loading settings" className="grid gap-3"><Skeleton className="h-20" /><Skeleton className="h-80" /></div>}><SettingsWorkspace /></Suspense>;
}
