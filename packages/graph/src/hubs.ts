import {
  hubDefinitionSchema,
  type HubDefinition,
  type HubKey,
  type NodeData,
} from "@aios/contracts";

const defineHub = (hub: HubDefinition): HubDefinition => hubDefinitionSchema.parse(hub);

/** Canonical stable hubs and deterministic force-layout placement hints from SRS §4.4. */
export const hubRegistry = Object.freeze({
  command: defineHub({
    key: "command",
    nodeId: "d42f787d-c6f4-5b97-87c3-5f54f3bf5129",
    stableKey: "hub:command",
    label: "Command",
    iconKey: "crown-star",
    placementHint: "center",
    normalizedPosition: { x: 0, y: 0 },
    containedTypes: [],
    contents: ["Dashboard", "Key metrics", "Owner profile", "Quick actions"],
    summary: "Dashboard, key metrics, owner profile, and quick actions.",
  }),
  clients: defineHub({
    key: "clients",
    nodeId: "02ed5eda-41d1-52f4-b272-d030255b4b6f",
    stableKey: "hub:clients",
    label: "Clients",
    iconKey: "building",
    placementHint: "upper_left",
    normalizedPosition: { x: -0.65, y: -0.55 },
    containedTypes: ["client", "human_contact", "task"],
    contents: ["Client nodes", "Contacts", "Projects"],
    summary: "All client nodes with their contacts and projects.",
  }),
  agents: defineHub({
    key: "agents",
    nodeId: "d61dcc77-35ad-5393-9445-f71f5bc533d2",
    stableKey: "hub:agents",
    label: "Agents",
    iconKey: "robot",
    placementHint: "upper_right",
    normalizedPosition: { x: 0.65, y: -0.55 },
    containedTypes: ["ai_agent"],
    contents: ["AI agent nodes", "Live status indicators"],
    summary: "All AI agent nodes with live status indicators.",
  }),
  finance: defineHub({
    key: "finance",
    nodeId: "b7be8485-a557-5ca2-aabb-be1f31d62fa0",
    stableKey: "hub:finance",
    label: "Finance",
    iconKey: "dollar",
    placementHint: "lower_right",
    normalizedPosition: { x: 0.65, y: 0.55 },
    containedTypes: ["revenue_finance"],
    contents: ["Revenue nodes", "Invoices", "Expenses", "Stripe data"],
    summary: "Revenue nodes, invoices, expenses, and Stripe data.",
  }),
  pipeline_crm: defineHub({
    key: "pipeline_crm",
    nodeId: "92c69628-2049-5d0e-91da-46ace200f057",
    stableKey: "hub:pipeline-crm",
    label: "Pipeline / CRM",
    iconKey: "funnel",
    placementHint: "right",
    normalizedPosition: { x: 0.85, y: 0 },
    containedTypes: ["human_contact", "task", "decision"],
    contents: ["Leads", "Deals", "Proposals", "Follow-ups"],
    summary: "Leads, deals, proposals, and follow-ups.",
  }),
  content: defineHub({
    key: "content",
    nodeId: "823f924c-33ba-5127-9901-e79d53bcf5d6",
    stableKey: "hub:content",
    label: "Content",
    iconKey: "pen-megaphone",
    placementHint: "lower_left",
    normalizedPosition: { x: -0.65, y: 0.55 },
    containedTypes: ["task", "knowledge_memory"],
    contents: ["Content calendar", "Published posts", "Drafts", "Templates"],
    summary: "Content calendar, published posts, drafts, and templates.",
  }),
  knowledge: defineHub({
    key: "knowledge",
    nodeId: "0f28919d-ff6b-58f3-bf41-b2a133269ebb",
    stableKey: "hub:knowledge",
    label: "Knowledge",
    iconKey: "brain",
    placementHint: "left",
    normalizedPosition: { x: -0.85, y: 0 },
    containedTypes: ["sop", "decision", "knowledge_memory"],
    contents: ["SOPs", "Templates", "Brand voices", "Lessons learned", "Memory"],
    summary: "SOPs, templates, brand voices, lessons learned, and memory.",
  }),
  automations: defineHub({
    key: "automations",
    nodeId: "89e8cde4-a2a6-5172-94e3-2e2b83f0f87e",
    stableKey: "hub:automations",
    label: "Automations",
    iconKey: "gear",
    placementHint: "lower_center",
    normalizedPosition: { x: 0, y: 0.75 },
    containedTypes: ["tool", "task"],
    contents: ["n8n workflows", "Make.com scenarios", "Webhook triggers"],
    summary: "n8n workflows, Make.com scenarios, and webhook triggers.",
  }),
  tools: defineHub({
    key: "tools",
    nodeId: "090066a5-ef79-537b-932b-531c710ae4c3",
    stableKey: "hub:tools",
    label: "Tools",
    iconKey: "wrench",
    placementHint: "periphery",
    normalizedPosition: { x: 0.95, y: -0.2 },
    containedTypes: ["tool"],
    contents: ["Connected integrations", "Integration status"],
    summary: "Connected integrations and their status.",
  }),
} as const satisfies Record<HubKey, HubDefinition>);

export const hubs = Object.freeze(Object.values(hubRegistry));

export function getHub(key: HubKey): HubDefinition {
  return hubRegistry[key];
}

export function getNodeHubKeys(node: NodeData): HubKey[] {
  if (node.type === "hub") return [node.metadata.hubKey];
  return [...node.hubKeys];
}

export function isNodeInHub(node: NodeData, key: HubKey): boolean {
  return getNodeHubKeys(node).includes(key);
}

export function groupNodesByHub(nodes: readonly NodeData[]): Record<HubKey, NodeData[]> {
  const grouped: Record<HubKey, NodeData[]> = {
    command: [],
    clients: [],
    agents: [],
    finance: [],
    pipeline_crm: [],
    content: [],
    knowledge: [],
    automations: [],
    tools: [],
  };
  for (const node of nodes) {
    for (const key of getNodeHubKeys(node)) grouped[key].push(node);
  }
  return grouped;
}
