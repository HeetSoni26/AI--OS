import Link from "next/link";
import {
  ArrowUpRight,
  Bot,
  CircleCheck,
  Database,
  GitBranch,
  Network,
  Plus,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty, WidgetBoundary } from "@/components/ui";

const readinessItems = [
  { label: "Owner access", description: "Protected route contract is active.", status: "Ready", color: "green", icon: ShieldCheck },
  { label: "Knowledge graph", description: "Renderer slot is ready for connected entities.", status: "Foundation", color: "cyan", icon: Network },
  { label: "Client operations", description: "Client records, contacts, projects, and communications are connected.", status: "Connected", color: "purple", icon: UsersRound },
  { label: "Agent runtime", description: "Execution surface is reserved for Part 5.", status: "Not connected", color: "orange", icon: Bot },
] as const;

const foundationLinks = [
  { href: "/knowledge-graph", label: "Open knowledge graph", description: "Explore the connected workspace view.", icon: Network, accent: "text-cyan-300" },
  { href: "/clients", label: "Set up clients", description: "Client operations are ready for real records.", icon: UsersRound, accent: "text-purple-300" },
  { href: "/agents", label: "Review agent surface", description: "Configure agents when the runtime is connected.", icon: Bot, accent: "text-green-300" },
  { href: "/settings", label: "Check workspace settings", description: "Review integrations and owner controls.", icon: ShieldCheck, accent: "text-orange-300" },
];

export default function DashboardPage() {
  return (
    <div className="grid gap-8">
      <header className="flex flex-col justify-between gap-5 border-b border-[#2A2E45] pb-7 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-300/80">/ workspace status</p>
          <h1 className="text-2xl font-semibold tracking-tight text-[#F3F5FF] sm:text-3xl">Good to see you, owner.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#888]">Your command center foundation is online. Connect real workspace data to turn these surfaces into operating views.</p>
        </div>
        <div className="flex flex-wrap gap-2"><Button disabled title="Create actions will be connected to domain routes"><Plus aria-hidden="true" className="size-4" />Create</Button><Button variant="ghost" className="hidden sm:inline-flex" disabled><ArrowUpRight aria-hidden="true" className="size-4" />View activity</Button></div>
      </header>

      <section aria-labelledby="readiness-heading" className="grid gap-4">
        <div className="flex items-end justify-between gap-4"><div><h2 id="readiness-heading" className="text-base font-semibold text-[#F3F5FF]">Foundation readiness</h2><p className="mt-1 text-xs text-[#888]">Honest system state, without placeholder business metrics.</p></div><Badge variant="cyan"><span aria-hidden="true" className="size-1.5 rounded-full bg-cyan-300" />Part 3</Badge></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {readinessItems.map((item) => { const Icon = item.icon; return <WidgetBoundary key={item.label} title={`${item.label} unavailable`}><Card className="min-h-40"><CardContent className="flex h-full flex-col justify-between gap-5"><div className="flex items-start justify-between gap-4"><span className="flex size-9 items-center justify-center rounded-lg border border-[#2A2E45] bg-[#111533]"><Icon aria-hidden="true" className="size-4 text-[#C5C8DB]" /></span><Badge variant={item.color}>{item.status}</Badge></div><div><h3 className="text-sm font-medium text-[#F3F5FF]">{item.label}</h3><p className="mt-1 text-xs leading-5 text-[#888]">{item.description}</p></div></CardContent></Card></WidgetBoundary>; })}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <WidgetBoundary title="Workspace map unavailable"><Card className="h-full"><CardHeader><div><CardTitle>Workspace map</CardTitle><CardDescription>The graph view is ready for your connected entities.</CardDescription></div><Network aria-hidden="true" className="size-4 text-cyan-300" /></CardHeader><CardContent><div className="app-grid relative min-h-56 overflow-hidden rounded-xl border border-cyan-300/10"><div className="absolute inset-0 flex flex-col items-center justify-center text-center"><span className="mb-4 flex size-12 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/10 text-cyan-300 shadow-[0_0_24px_rgba(0,240,255,0.12)]"><Network aria-hidden="true" className="size-5" /></span><p className="text-sm font-medium text-[#C5C8DB]">No connected entities yet</p><p className="mt-1 max-w-xs text-xs leading-5 text-[#888]">The graph will show relationships once real clients, agents, and knowledge records are available.</p><Link href="/knowledge-graph" className="mt-4 text-xs font-medium text-cyan-300 hover:text-cyan-200">Open graph surface <span aria-hidden="true">→</span></Link></div></div></CardContent></Card></WidgetBoundary>
        <WidgetBoundary title="Setup checklist unavailable"><Card className="h-full"><CardHeader><div><CardTitle>Next connections</CardTitle><CardDescription>Start with the surfaces that need owner input.</CardDescription></div><GitBranch aria-hidden="true" className="size-4 text-purple-300" /></CardHeader><CardContent className="grid gap-2">{foundationLinks.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-3 transition-colors hover:border-[#2A2E45] hover:bg-white/[0.03]"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#2A2E45] bg-[#111533]"><Icon aria-hidden="true" className={`size-3.5 ${item.accent}`} /></span><span className="min-w-0 flex-1"><span className="block text-xs font-medium text-[#C5C8DB] group-hover:text-[#F3F5FF]">{item.label}</span><span className="mt-0.5 block text-[11px] leading-4 text-[#888]">{item.description}</span></span><ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0 text-[#555] group-hover:text-[#C5C8DB]" /></Link>; })}</CardContent></Card></WidgetBoundary>
      </div>

      <section aria-labelledby="activity-heading"><Card><CardHeader><div><CardTitle id="activity-heading">Recent activity</CardTitle><CardDescription>Activity will appear here after connected workspace events.</CardDescription></div><Database aria-hidden="true" className="size-4 text-[#888]" /></CardHeader><CardContent><Empty title="No activity yet" description="There are no recorded workspace events. Connected domain actions will show up here with their source and status." icon={<CircleCheck aria-hidden="true" className="size-4 text-[#555]" />} /></CardContent></Card></section>
    </div>
  );
}
