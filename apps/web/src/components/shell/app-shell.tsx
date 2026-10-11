"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Command,
  Menu,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { navigationItems, mobileNavigationItems, isNavigationItemActive } from "@/lib/navigation";
import { logoutAction } from "@/app/(auth)/actions";
import { initials, cn } from "@/lib/utils";
import {
  CommandRegistrationProvider,
  useActiveShellCommand,
} from "@/components/providers/command-registration-provider";
import {
  ContextPanelOutlet,
  ContextPanelProvider,
} from "@/components/providers/context-panel-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { LiveRegionProvider } from "@/components/ui/live-region";
import { NotificationsFeed } from "@/components/shell/notifications-feed";

type OwnerRecord = {
  displayName?: string | null;
  name?: string | null;
  email?: string | null;
};

type AppShellProps = {
  children: React.ReactNode;
  owner?: OwnerRecord | null;
  demoMode?: boolean;
};

export function isFullBleedShellRoute(pathname: string) {
  return pathname === "/knowledge-graph" || pathname.startsWith("/knowledge-graph/");
}

export function AppShell(props: AppShellProps) {
  return (
    <CommandRegistrationProvider>
      <AppShellContent {...props} />
    </CommandRegistrationProvider>
  );
}

function AppShellContent({ children, owner, demoMode }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const ownerName = owner?.displayName || owner?.name || "Workspace owner";
  const ownerEmail = owner?.email || "Owner access";
  const openDefaultPalette = useCallback(() => setPaletteOpen(true), []);
  const shellCommand = useActiveShellCommand({
    buttonLabel: "Open command palette",
    buttonText: "Search workspace",
    invoke: openDefaultPalette,
  });
  const fullBleed = isFullBleedShellRoute(pathname);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        shellCommand.invoke();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [shellCommand.invoke]);

  const activeItem = useMemo(
    () => navigationItems.find((item) => isNavigationItemActive(pathname, item.href)),
    [pathname],
  );

  return (
    <LiveRegionProvider>
      <ContextPanelProvider>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <div className="app-grid flex min-h-screen flex-col bg-[#07080F]">
        <header className="fixed inset-x-0 top-0 z-50 h-12 border-b border-[#2A2E45] bg-[#07080F]/95 backdrop-blur-md">
          <div className="flex h-full items-center justify-between gap-3 px-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation"
                aria-expanded={mobileNavOpen}
                onClick={() => setMobileNavOpen((open) => !open)}
              >
                {mobileNavOpen ? <X aria-hidden="true" className="size-4" /> : <Menu aria-hidden="true" className="size-4" />}
              </Button>
              <Link href="/dashboard" aria-label="AI OS dashboard" className="group flex min-w-0 items-center gap-2">
                <span className="relative flex size-6 shrink-0 items-center justify-center rounded-md border border-cyan-300/50 bg-cyan-300/10 text-cyan-300 shadow-[0_0_14px_rgba(0,240,255,0.13)]">
                  <span aria-hidden="true" className="size-2 rounded-full bg-cyan-300" />
                </span>
                <span className="hidden truncate text-xs font-semibold tracking-[0.18em] text-[#F3F5FF] sm:inline">AI OS</span>
                <span className="hidden text-[10px] text-[#888] md:inline">/ COMMAND CENTER</span>
              </Link>
            </div>

            <button
              type="button"
              onClick={shellCommand.invoke}
              className="flex h-8 min-w-0 max-w-[420px] flex-1 items-center justify-between gap-3 rounded-lg border border-[#2A2E45] bg-[#0C1020] px-3 text-left text-xs text-[#888] transition-colors hover:border-cyan-300/40 hover:text-[#C5C8DB] sm:mx-4 sm:flex-initial sm:w-[min(38vw,360px)]"
              aria-label={shellCommand.buttonLabel}
            >
              <span className="flex min-w-0 items-center gap-2"><Search aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">{shellCommand.buttonText}</span></span>
              <kbd className="hidden shrink-0 px-1.5 py-1 sm:inline-flex"><Command aria-hidden="true" className="mr-1 size-2.5" />K</kbd>
            </button>

            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon" aria-label="Open notifications" onClick={() => setNotificationsOpen(true)}>
                <Bell aria-hidden="true" className="size-4" />
              </Button>
              <div className="mx-1 hidden h-5 w-px bg-[#2A2E45] sm:block" />
              <Button
                variant="ghost"
                size="sm"
                className="max-w-44 gap-2 px-1.5 sm:px-2"
                aria-label="Open owner controls"
                aria-expanded={ownerOpen}
                onClick={() => setOwnerOpen((open) => !open)}
              >
                <span className="flex size-6 items-center justify-center rounded-full border border-purple-300/40 bg-purple-300/10 text-[10px] font-semibold text-purple-200">{initials(ownerName)}</span>
                <span className="hidden truncate text-xs text-[#C5C8DB] md:inline">{ownerName}</span>
                <ChevronRight aria-hidden="true" className={cn("hidden size-3 text-[#888] transition-transform md:inline", ownerOpen && "rotate-90")} />
              </Button>
              {ownerOpen ? (
                <div className="absolute right-3 top-11 w-64 rounded-xl border border-[#2A2E45] bg-[#0C1020] p-3" role="dialog" aria-label="Owner controls">
                  <div className="flex items-center gap-3 border-b border-[#2A2E45] pb-3">
                    <span className="flex size-9 items-center justify-center rounded-full border border-purple-300/40 bg-purple-300/10 text-xs font-semibold text-purple-200">{initials(ownerName)}</span>
                    <div className="min-w-0"><p className="truncate text-sm font-medium text-[#F3F5FF]">{ownerName}</p><p className="truncate text-[11px] text-[#888]">{ownerEmail}</p></div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-green-400/20 bg-green-400/5 px-3 py-2 text-xs text-green-200"><ShieldCheck aria-hidden="true" className="size-3.5" />Owner-only workspace</div>
                  <Link href="/settings" onClick={() => setOwnerOpen(false)} className="mt-3 flex h-9 items-center rounded-lg px-3 text-xs text-[#C5C8DB] hover:bg-white/5">Workspace settings</Link>
                  <form action={logoutAction}><button type="submit" className="mt-1 flex h-9 w-full items-center rounded-lg px-3 text-xs text-[#888] hover:bg-white/5 hover:text-[#F3F5FF]">Sign out</button></form>
                </div>
              ) : null}
            </div>
          </div>
        </header>
      {demoMode ? (
        <div role="status" className="border-b border-amber-300/20 bg-amber-300/[0.06] px-4 py-1.5 text-center text-[10px] uppercase tracking-[0.14em] text-amber-200">
          Demo workspace - reset on redeploy
        </div>
      ) : null}

        <aside className={cn("fixed bottom-0 left-0 top-12 z-40 hidden w-16 border-r border-[#2A2E45] bg-[#0C1020] transition-[width] duration-200 md:block", sidebarCollapsed ? "xl:w-16" : "xl:w-60")}>
          <nav aria-label="Primary navigation" className="surface-scrollbar flex h-full flex-col overflow-y-auto p-3">
            <div className="mb-4 flex items-center justify-between px-2 pt-2"><span className={cn("hidden text-[10px] font-medium uppercase tracking-[0.16em] text-[#888] xl:inline", sidebarCollapsed && "xl:sr-only")}>Workspace</span><button type="button" className="hidden size-7 items-center justify-center rounded-md text-[#888] hover:bg-white/5 hover:text-[#F3F5FF] xl:flex" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>{sidebarCollapsed ? <ChevronRight aria-hidden="true" className="size-3.5" /> : <ChevronLeft aria-hidden="true" className="size-3.5" />}</button></div>
            <div className="grid gap-1">
              {navigationItems.map((item) => {
                const active = isNavigationItemActive(pathname, item.href);
                const Icon = item.icon;
                return <Link key={item.href} href={item.href} title={sidebarCollapsed ? item.label : item.description} aria-current={active ? "page" : undefined} className={cn("group flex min-h-10 items-center justify-center gap-3 rounded-lg px-0 text-xs transition-colors xl:justify-start xl:px-3", active ? "border border-cyan-300/20 bg-cyan-300/10 text-cyan-200" : "text-[#888] hover:bg-white/[0.04] hover:text-[#C5C8DB]", sidebarCollapsed && "justify-center px-0")}><Icon aria-hidden="true" className={cn("size-4 shrink-0", active ? "text-cyan-300" : "text-[#888] group-hover:text-[#C5C8DB]")} /><span className={cn("hidden truncate xl:inline", sidebarCollapsed && "xl:sr-only")}>{item.label}</span>{active && !sidebarCollapsed ? <span aria-hidden="true" className="ml-auto hidden size-1.5 rounded-full bg-cyan-300 xl:inline" /> : null}</Link>;
              })}
            </div>
            <div className={cn("mt-auto hidden border-t border-[#2A2E45] pt-4 xl:block", sidebarCollapsed && "border-transparent")}><p className={cn("px-3 text-[10px] leading-4 text-[#888]", sidebarCollapsed && "sr-only")}>Private workspace<br />Client operations · Part 3</p></div>
          </nav>
        </aside>

        {mobileNavOpen ? <div className="fixed inset-0 top-12 z-40 md:hidden"><button aria-label="Close navigation" className="absolute inset-0 bg-[#07080F]/75" onClick={() => setMobileNavOpen(false)} /><nav aria-label="Mobile primary navigation" className="surface-scrollbar relative h-full w-[min(18rem,85vw)] overflow-y-auto border-r border-[#2A2E45] bg-[#0C1020] p-3"><div className="mb-3 flex items-center justify-between px-2 py-2"><span className="text-[10px] uppercase tracking-[0.16em] text-[#888]">Workspace</span><Button variant="ghost" size="icon" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}><X aria-hidden="true" className="size-4" /></Button></div>{navigationItems.map((item) => { const Icon = item.icon; const active = isNavigationItemActive(pathname, item.href); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm", active ? "bg-cyan-300/10 text-cyan-200" : "text-[#888] hover:bg-white/5 hover:text-[#C5C8DB]")}><Icon aria-hidden="true" className="size-4" />{item.label}</Link>; })}</nav></div> : null}

        <div className={cn("flex min-h-screen flex-1 pt-12 md:pl-16", sidebarCollapsed ? "xl:pl-16" : "xl:pl-60")}>
          <main
            id="main-content"
            tabIndex={-1}
            data-shell-layout={fullBleed ? "full-bleed" : "contained"}
            className={cn(
              "min-w-0 flex-1",
              fullBleed
                ? "flex min-h-[calc(100vh-var(--topbar-height))] pb-[var(--bottom-nav-height)] md:pb-0"
                : "px-4 pb-24 pt-6 sm:px-6 lg:pb-8 lg:pt-8",
            )}
          >
            <div className={cn("w-full", fullBleed ? "flex min-w-0 flex-1" : "mx-auto max-w-[1440px]")}>{children}</div>
          </main>
          <aside aria-label="Context panel" className={cn("surface-scrollbar hidden w-80 shrink-0 overflow-y-auto border-l border-[#2A2E45] bg-[#0C1020]/60 p-5 xl:block", fullBleed && "xl:hidden")}>
            <ContextPanelOutlet
              fallback={
                <div className="sticky top-0">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[#888]">Context panel</p>
                  <p className="text-xs leading-5 text-[#888]">This 320px slot is available for contextual directory, detail, and related-work surfaces.</p>
                  <div className="mt-5 rounded-xl border border-dashed border-[#2A2E45] p-4"><p className="text-xs font-medium text-[#888]">{activeItem?.label ?? "Workspace"}</p><p className="mt-1 text-[11px] leading-5 text-[#888]">No contextual content is available for this route.</p></div>
                </div>
              }
            />
          </aside>
        </div>

        <nav aria-label="Mobile tab navigation" className="fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-5 border-t border-[#2A2E45] bg-[#0C1020]/95 px-1 backdrop-blur-md md:hidden">
          {mobileNavigationItems.map((item) => { const Icon = item.icon; const active = isNavigationItemActive(pathname, item.href); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center justify-center gap-1 text-[10px]", active ? "text-cyan-300" : "text-[#888] hover:text-[#C5C8DB]")}><Icon aria-hidden="true" className="size-4" />{item.label}</Link>; })}
        </nav>

        <Dialog open={paletteOpen} onClose={() => setPaletteOpen(false)} title="Command palette" description="Jump to a workspace area. Press Escape to close.">
          <div className="grid gap-2">
            {navigationItems.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={() => setPaletteOpen(false)} className="flex items-center gap-3 rounded-lg border border-transparent px-3 py-3 text-sm text-[#C5C8DB] hover:border-cyan-300/20 hover:bg-cyan-300/5"><Icon aria-hidden="true" className="size-4 text-cyan-300" /><span>{item.label}</span><span className="ml-auto text-[10px] text-[#888]">{item.description}</span></Link>; })}
          </div>
        </Dialog>
        <Dialog open={notificationsOpen} onClose={() => setNotificationsOpen(false)} title="Notifications" description="Durable in-app records from workspace events - agent errors, new leads, overdue invoices."><NotificationsFeed /></Dialog>
      </div>
      </ContextPanelProvider>
    </LiveRegionProvider>
  );
}
