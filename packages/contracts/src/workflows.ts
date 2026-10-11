import { z } from "zod";
import { cursorSchema, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./api";

export const workflowProviders = ["n8n", "make"] as const;
export const workflowProviderSchema = z.enum(workflowProviders);
export type WorkflowProviderName = z.infer<typeof workflowProviderSchema>;
export const WORKFLOW_PROVIDER_LABELS = { n8n: "n8n", make: "Make.com" } as const satisfies Record<WorkflowProviderName, string>;

export const workflowStatuses = ["draft", "pending_approval", "active", "paused", "archived"] as const;
export const workflowStatusSchema = z.enum(workflowStatuses);
export type WorkflowStatus = z.infer<typeof workflowStatusSchema>;
export const WORKFLOW_STATUS_LABELS = {
  draft: "Draft",
  pending_approval: "Pending approval",
  active: "Active",
  paused: "Paused",
  archived: "Archived",
} as const satisfies Record<WorkflowStatus, string>;

export const workflowExecutionStatuses = ["queued", "running", "success", "failed", "timeout"] as const;
export const workflowExecutionStatusSchema = z.enum(workflowExecutionStatuses);
export type WorkflowExecutionStatus = z.infer<typeof workflowExecutionStatusSchema>;
export const WORKFLOW_EXECUTION_STATUS_LABELS = {
  queued: "Queued",
  running: "Running",
  success: "Success",
  failed: "Failed",
  timeout: "Timeout",
} as const satisfies Record<WorkflowExecutionStatus, string>;

export const workflowNodeSchema = z.strictObject({
  id: z.string().trim().min(1).max(100),
  type: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(255),
  parameters: z.record(z.string(), z.unknown()).default({}),
});
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;

export const workflowConnectionSchema = z.strictObject({
  from: z.string().trim().min(1).max(100),
  to: z.string().trim().min(1).max(100),
});
export type WorkflowConnection = z.infer<typeof workflowConnectionSchema>;

export const workflowBlueprintSchema = z.strictObject({
  nodes: z.array(workflowNodeSchema).min(1).max(100),
  connections: z.array(workflowConnectionSchema).max(200).default([]),
  trigger: z.string().trim().min(1).max(100),
});
export type WorkflowBlueprint = z.infer<typeof workflowBlueprintSchema>;

export interface WorkflowValidationIssue {
  code: "missing_connection" | "unreachable_node" | "cycle" | "unhandled_error" | "unsafe_action" | "empty_blueprint";
  message: string;
  nodeId?: string;
}

export const workflowValidationSchema = z.strictObject({
  valid: z.boolean(),
  issues: z.array(z.strictObject({
    code: z.string(),
    message: z.string().max(500),
    nodeId: z.string().max(100).optional(),
  })),
});
export type WorkflowValidation = z.infer<typeof workflowValidationSchema>;

export const workflowCreateSchema = z.strictObject({
  clientId: z.uuid(),
  agentId: z.uuid().nullable().optional(),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2_000).nullable().optional(),
  provider: workflowProviderSchema,
  blueprint: workflowBlueprintSchema,
  humanPlan: z.string().trim().min(1).max(10_000),
  assumptions: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  changeSummary: z.string().trim().max(500).nullable().optional(),
});
export type WorkflowCreateInput = z.infer<typeof workflowCreateSchema>;

export const workflowUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2_000).nullable().optional(),
  blueprint: workflowBlueprintSchema.optional(),
  humanPlan: z.string().trim().min(1).max(10_000).optional(),
  assumptions: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  changeSummary: z.string().trim().max(500).nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, "At least one field is required.");
export type WorkflowUpdateInput = z.infer<typeof workflowUpdateSchema>;

export const workflowListQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  clientId: z.uuid().optional(),
  statuses: z.array(workflowStatusSchema).optional(),
  providers: z.array(workflowProviderSchema).optional(),
  search: z.string().trim().max(200).optional(),
});
export type WorkflowListQuery = z.infer<typeof workflowListQuerySchema>;

export const workflowExecutionListQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  workflowId: z.uuid().optional(),
  statuses: z.array(workflowExecutionStatusSchema).optional(),
});
export type WorkflowExecutionListQuery = z.infer<typeof workflowExecutionListQuerySchema>;

export const workflowEventSchema = z.strictObject({
  event: z.enum(["execution_complete", "execution_failed"]),
  providerWorkflowId: z.string().trim().min(1).max(255),
  providerExecutionId: z.string().trim().min(1).max(255),
  status: workflowExecutionStatusSchema.optional(),
  failureStep: z.string().trim().max(255).nullable().optional(),
  errorMessage: z.string().trim().max(2_000).nullable().optional(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
});
export type WorkflowEventInput = z.infer<typeof workflowEventSchema>;
