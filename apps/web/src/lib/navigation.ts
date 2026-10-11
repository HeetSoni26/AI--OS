import type { LucideIcon } from "lucide-react";
import {
  BadgeDollarSign,
  Bot,
  ChartNoAxesCombined,
  Database,
  GitBranch,
  LayoutDashboard,
  MessagesSquare,
  Network,
  PenLine,
  Settings,
  UsersRound,
  Workflow,
} from "lucide-react";

export type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  mobile?: boolean;
};

export const navigationItems: readonly NavigationItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, description: "System readiness and workspace overview", mobile: true },
  { label: "Knowledge Graph", href: "/knowledge-graph", icon: Network, description: "Connected agency entities", mobile: true },
  { label: "Clients", href: "/clients", icon: UsersRound, description: "Client operations", mobile: true },
  { label: "Agents", href: "/agents", icon: Bot, description: "AI agent operations", mobile: true },
  { label: "Chatbots", href: "/chatbots", icon: MessagesSquare, description: "Client chatbot builder and conversations" },
  { label: "Automations", href: "/workflows", icon: Workflow, description: "Workflow automation builder and health" },
  { label: "Content", href: "/content", icon: PenLine, description: "Brand voice, artifacts, and publishing calendar" },
  { label: "Finance", href: "/finance", icon: BadgeDollarSign, description: "Revenue and expense operations" },
  { label: "Pipeline", href: "/pipeline", icon: GitBranch, description: "Sales pipeline", mobile: true },
  { label: "Knowledge Base", href: "/knowledge-base", icon: Database, description: "Operational knowledge" },
  { label: "Reports", href: "/reports", icon: ChartNoAxesCombined, description: "Business and system reporting" },
  { label: "Settings", href: "/settings", icon: Settings, description: "Workspace and integration settings" },
] as const;

export const mobileNavigationItems = navigationItems.filter((item) => item.mobile);

export function isNavigationItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
