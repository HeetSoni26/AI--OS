/** Least-privilege tool registry for the agent runtime (SRS FR-AM tool gateway). */
export type ToolRiskClass = "safe" | "elevated" | "consequential";

export interface ToolDefinition {
  id: string;
  type: string;
  label: string;
  description: string;
  riskClass: ToolRiskClass;
  /** Consequential tools require an owner approval checkpoint before execution. */
  requiresApproval: boolean;
}

export const TOOL_REGISTRY: readonly ToolDefinition[] = [
  {
    id: "web_search",
    type: "web_search",
    label: "Web Search",
    description: "Query public web search results for research tasks.",
    riskClass: "safe",
    requiresApproval: false,
  },
  {
    id: "file_read",
    type: "file_read",
    label: "File Read",
    description: "Read owner-approved workspace files, scoped to the run's client.",
    riskClass: "safe",
    requiresApproval: false,
  },
  {
    id: "file_write",
    type: "file_write",
    label: "File Write",
    description: "Write run artifacts to the private workspace store for the run's client.",
    riskClass: "elevated",
    requiresApproval: false,
  },
  {
    id: "code_execute",
    type: "code_execute",
    label: "Code Execution",
    description: "Execute sandboxed code snippets with no network egress.",
    riskClass: "elevated",
    requiresApproval: false,
  },
  {
    id: "api_call",
    type: "api_call",
    label: "API Call",
    description: "Call owner-registered HTTP APIs with redacted credentials.",
    riskClass: "consequential",
    requiresApproval: true,
  },
  {
    id: "email_send",
    type: "email_send",
    label: "Email Send",
    description: "Send email on the owner's behalf through configured integrations.",
    riskClass: "consequential",
    requiresApproval: true,
  },
];

const REGISTRY_BY_ID = new Map(TOOL_REGISTRY.map((tool) => [tool.id, tool]));

export function getToolDefinition(idOrType: string): ToolDefinition | undefined {
  return REGISTRY_BY_ID.get(idOrType)
    ?? TOOL_REGISTRY.find((tool) => tool.type === idOrType);
}

/** Resolves whether an agent configuration requests a tool that requires approval. Unknown tools fail safe to true. */
export function requiresApprovalForTools(toolIds: readonly string[]): boolean {
  return toolIds.some((id) => getToolDefinition(id)?.requiresApproval !== false);
}

/** Tool declarations rendered into the owner-facing configuration UI. */
export function describeTools(toolIds: readonly string[]): Array<{ id: string; label: string; riskClass: ToolRiskClass; requiresApproval: boolean }> {
  return toolIds.map((id) => {
    const definition = getToolDefinition(id);
    return {
      id,
      label: definition?.label ?? id,
      riskClass: definition?.riskClass ?? "elevated",
      requiresApproval: definition?.requiresApproval ?? true,
    };
  });
}
