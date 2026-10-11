import { describe, expect, it } from "vitest";
import { graphEdgeTypes, graphNodeTypes, hubKeys } from "@aios/contracts";
import { groupNodesByHub, hubRegistry, hubs, isNodeInHub } from "./hubs";
import { edgeTypeRegistry, nodeTypeRegistry } from "./registries";
import { AGENT_GRAPH_ID, CLIENT_GRAPH_ID, CLIENTS_HUB_GRAPH_ID, makeAgent, makeClient, makeHub } from "./test-helpers";

const exactNodeVisuals = {
  client: { label: "Client", color: "#00F0FF", iconKey: "building", radius: 20 },
  ai_agent: { label: "AI Agent", color: "#39FF14", iconKey: "robot-gear", radius: 14 },
  tool: { label: "Tool", color: "#FF6B2B", iconKey: "wrench", radius: 12 },
  sop: { label: "SOP", color: "#CCCCCC", iconKey: "document", radius: 10 },
  human_contact: { label: "Human / Contact", color: "#FFD700", iconKey: "person", radius: 12 },
  task: { label: "Task", color: "#FFFFFF", iconKey: "checkbox", radius: 8 },
  decision: { label: "Decision", color: "#B026FF", iconKey: "lightbulb", radius: 10 },
  knowledge_memory: { label: "Knowledge / Memory", color: "#4488FF", iconKey: "brain", radius: 10 },
  revenue_finance: { label: "Revenue / Finance", color: "#00FF88", iconKey: "dollar", radius: 10 },
  hub: { label: "Hub (Category)", color: "#FFFFFF", iconKey: "custom", radius: 28 },
};

describe("canonical visual registries", () => {
  it("keeps all ten exact node labels, colors, icon keys, and radii", () => {
    expect(Object.keys(nodeTypeRegistry)).toEqual(graphNodeTypes);
    expect(nodeTypeRegistry).toEqual(exactNodeVisuals);
  });

  it("encodes all seven edge visual and accessibility semantics", () => {
    expect(Object.keys(edgeTypeRegistry)).toEqual(graphEdgeTypes);
    expect(edgeTypeRegistry.ownership).toMatchObject({ lineStyle: "solid", width: 2, accessibleLabel: "owns or contains" });
    expect(edgeTypeRegistry.assignment).toMatchObject({ lineStyle: "dashed", width: 1, accessibleLabel: "is assigned to" });
    expect(edgeTypeRegistry.data_flow).toMatchObject({ animated: true, movingDots: true, accessibleLabel: "sends data to" });
    expect(edgeTypeRegistry.dependency).toMatchObject({ lineStyle: "dotted", color: "#808080", accessibleLabel: "depends on" });
    expect(edgeTypeRegistry.trigger).toMatchObject({ lineStyle: "solid", arrow: true, color: "#FF6B2B", accessibleLabel: "triggers" });
    expect(edgeTypeRegistry.reference).toMatchObject({ width: 0.5, opacity: 0.35, accessibleLabel: "references" });
    expect(edgeTypeRegistry.financial).toMatchObject({ color: "#39FF14", markerIconKey: "dollar", accessibleLabel: "has financial relationship with" });
    expect(Object.values(edgeTypeRegistry).every((edge) => edge.accessibleDescription.length > 0 && edge.reducedMotionDescription.length > 0)).toBe(true);
  });
});

describe("stable hub registry and membership", () => {
  it("defines all nine stable hubs with canonical labels and placement hints", () => {
    expect(hubs).toHaveLength(9);
    expect(Object.keys(hubRegistry)).toEqual(hubKeys);
    expect(hubs.map(({ key, label, placementHint }) => ({ key, label, placementHint }))).toEqual([
      { key: "command", label: "Command", placementHint: "center" },
      { key: "clients", label: "Clients", placementHint: "upper_left" },
      { key: "agents", label: "Agents", placementHint: "upper_right" },
      { key: "finance", label: "Finance", placementHint: "lower_right" },
      { key: "pipeline_crm", label: "Pipeline / CRM", placementHint: "right" },
      { key: "content", label: "Content", placementHint: "lower_left" },
      { key: "knowledge", label: "Knowledge", placementHint: "left" },
      { key: "automations", label: "Automations", placementHint: "lower_center" },
      { key: "tools", label: "Tools", placementHint: "periphery" },
    ]);
    expect(hubs.every((hub) => /^[0-9a-f-]{36}$/u.test(hub.nodeId) && hub.nodeId !== hub.stableKey && hub.stableKey.startsWith("hub:") && hub.summary.length > 0)).toBe(true);
    expect(hubRegistry.clients).toMatchObject({ nodeId: CLIENTS_HUB_GRAPH_ID, stableKey: "hub:clients" });
    expect(hubRegistry.pipeline_crm.stableKey).toBe("hub:pipeline-crm");
  });

  it("uses explicit membership, including multi-hub nodes and hub nodes", () => {
    const client = makeClient();
    const agent = makeAgent();
    const hub = makeHub();
    expect(isNodeInHub(agent, "agents")).toBe(true);
    expect(isNodeInHub(agent, "clients")).toBe(true);
    expect(isNodeInHub(hub, "clients")).toBe(true);
    const grouped = groupNodesByHub([client, agent, hub]);
    expect(grouped.clients.map((node) => node.id)).toEqual([CLIENT_GRAPH_ID, AGENT_GRAPH_ID, CLIENTS_HUB_GRAPH_ID]);
    expect(grouped.agents.map((node) => node.id)).toEqual([AGENT_GRAPH_ID]);
  });
});
