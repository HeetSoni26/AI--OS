import Link from "next/link";
import { ArrowLeft, CircleDashed, Construction } from "lucide-react";
import { navigationItems } from "@/lib/navigation";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty } from "@/components/ui";

export function PlaceholderPage({ title, description, eyebrow }: { title: string; description: string; eyebrow?: string }) {
  const item = navigationItems.find((navigationItem) => navigationItem.label === title);
  const Icon = item?.icon ?? Construction;
  return (
    <div className="grid gap-8">
      <header className="border-b border-[#2A2E45] pb-7">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-300/80">/ {eyebrow ?? "workspace module"}</p>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="text-2xl font-semibold tracking-tight text-[#F3F5FF] sm:text-3xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#888]">{description}</p></div>
          <Badge variant="orange"><span aria-hidden="true" className="size-1.5 rounded-full bg-orange-300" />Not implemented</Badge>
        </div>
      </header>
      <Card className="mx-auto w-full max-w-2xl"><CardHeader><div><CardTitle className="flex items-center gap-2"><Icon aria-hidden="true" className="size-4 text-cyan-300" />{title} surface</CardTitle><CardDescription>This route is intentionally honest while its domain implementation is scheduled.</CardDescription></div><CircleDashed aria-hidden="true" className="size-4 text-[#555]" /></CardHeader><CardContent><Empty title="No module data connected" description="Part 1 establishes the shell and accessibility contracts. This module will show real records when its domain slice is implemented; it will not display invented metrics or claim unavailable actions." /></CardContent></Card>
      <div className="flex flex-wrap justify-center gap-2"><Button variant="ghost" disabled><Construction aria-hidden="true" className="size-4" />Actions will be enabled with this module</Button><Link href="/dashboard" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#2A2E45] px-4 text-sm text-[#C5C8DB] hover:border-cyan-300/40 hover:bg-[#111533]"><ArrowLeft aria-hidden="true" className="size-4" />Return to dashboard</Link></div>
    </div>
  );
}
