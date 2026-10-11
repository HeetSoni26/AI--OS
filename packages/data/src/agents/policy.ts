import { createHash } from "node:crypto";
import type { Prisma } from "../generated/client/client";
import type { AgentStatus, AgentTriggerType } from "../generated/client/enums";

/** Provider-neutral model catalog: per-1K-token USD pricing and context windows. */
export const MODEL_CATALOG = {
  "gpt-4o": { provider: "openai", inputPerK: 0.0025, outputPerK: 0.01, maxContext: 128_000 },
  "gpt-4o-mini": { provider: "openai", inputPerK: 0.00015, outputPerK: 0.0006, maxContext: 128_000 },
  "claude-3-5-sonnet": { provider: "anthropic", inputPerK: 0.003, outputPerK: 0.015, maxContext: 200_000 },
  "claude-4": { provider: "anthropic", inputPerK: 0.003, outputPerK: 0.015, maxContext: 200_000 },
} as const;

export type CatalogModel = keyof typeof MODEL_CATALOG;

export function modelProvider(model: string): string | null {
  return (MODEL_CATALOG as Record<string, { provider: string }>)[model]?.provider ?? null;
}

export function computeRunCostUsd(model: string, tokensInput: number, tokensOutput: number): number | null {
  const pricing = (MODEL_CATALOG as Record<string, { inputPerK: number; outputPerK: number }>)[model];
  if (!pricing) return null;
  const cost = (tokensInput / 1000) * pricing.inputPerK + (tokensOutput / 1000) * pricing.outputPerK;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Exponential backoff for the 3 allowed retries (2s, 30s, 120s). */
export const RETRY_DELAYS_MS = [5_000, 30_000, 120_000] as const;
export const MAX_RUN_ATTEMPTS = 1 + RETRY_DELAYS_MS.length;

export function retryDelayMs(attempt: number): number | null {
  const index = attempt - 1;
  return index >= 0 && index < RETRY_DELAYS_MS.length ? RETRY_DELAYS_MS[index] : null;
}

export type RunErrorClass = "retryable" | "terminal" | "timeout";

export function classifyRunError(error: { status?: number; code?: string; message: string }): RunErrorClass {
  const status = error.status ?? 0;
  const code = error.code ?? "";
  if (code === "ETIMEDOUT" || code === "ABORT_ERR" || /timeout/i.test(error.message)) return "timeout";
  if (status === 429 || (status >= 500 && status < 600) || code === "ECONNRESET") return "retryable";
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) return "terminal";
  return "retryable";
}

const CRON_FIELD_RANGES = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 7 },
] as const;

export function validateCronExpression(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((field, index) => {
    const range = CRON_FIELD_RANGES[index]!;
    return field.split(",").every((part) => {
      const list = part.split("/");
      const step = list.length === 2 ? Number(list[1]) : 1;
      if (list.length > 2 || !Number.isInteger(step) || step < 1) return false;
      const base = list[0]!;
      if (base === "*") return true;
      const segments = base.split("-");
      if (segments.length === 1) {
        const value = Number(segments[0]);
        return Number.isInteger(value) && value >= range.min && value <= range.max;
      }
      if (segments.length === 2) {
        const start = Number(segments[0]);
        const end = Number(segments[1]);
        return Number.isInteger(start) && Number.isInteger(end) && start <= end && start >= range.min && end <= range.max;
      }
      return false;
    });
  });
}

export function normalizeCronExpression(expression: string | null | undefined): string | null {
  if (expression == null) return null;
  const normalized = expression.trim();
  return normalized.length ? normalized : null;
}

/** SHA-256 of canonical JSON for approval-tamper detection. */
export function computePayloadHash(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

export type AgentRunTransition =
  | "enqueue"
  | "start"
  | "complete"
  | "fail"
  | "timeout"
  | "cancel"
  | "requeue";

const RUN_STATE_TRANSITIONS: Record<string, readonly string[]> = {
  queued: ["running", "cancelled"],
  running: ["success", "failed", "timeout", "cancelled", "queued"],
  success: [],
  failed: ["queued"],
  timeout: ["queued"],
  cancelled: [],
};

export function canTransitionRunStatus(from: string, to: string): boolean {
  return (RUN_STATE_TRANSITIONS[from] ?? []).includes(to);
}

/** Cycle detection over an adjacency map built from existing chains plus a candidate edge. */
export function detectChainCycle(
  existingEdges: readonly { parentAgentId: string; childAgentId: string }[],
  candidate: { parentAgentId: string; childAgentId: string },
): boolean {
  if (candidate.parentAgentId === candidate.childAgentId) return true;
  const adjacency = new Map<string, string[]>();
  for (const edge of [...existingEdges, candidate]) {
    const list = adjacency.get(edge.parentAgentId) ?? [];
    list.push(edge.childAgentId);
    adjacency.set(edge.parentAgentId, list);
  }
  const visited = new Set<string>();
  const onPath = new Set<string>();
  const visit = (node: string): boolean => {
    if (onPath.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    onPath.add(node);
    for (const next of adjacency.get(node) ?? []) {
      if (visit(next)) return true;
    }
    onPath.delete(node);
    return false;
  };
  for (const node of adjacency.keys()) {
    if (visit(node)) return true;
  }
  return false;
}

export const MAX_CHAIN_DEPTH = 5;

export function chainDepthExceeded(depth: number): boolean {
  return depth > MAX_CHAIN_DEPTH;
}

export type AgentTriggerShape = {
  type: "manual" | "scheduled" | "event" | "chain" | "webhook";
  cronExpression?: string | null;
};

export function normalizeTrigger(input: Prisma.JsonValue | null | undefined): AgentTriggerShape {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { type: "manual" };
  const record = input as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "manual";
  const cron = typeof record.cronExpression === "string" ? record.cronExpression : null;
  return { type: type as AgentTriggerShape["type"], cronExpression: cron };
}

export function agentStatusToDb(status: string): AgentStatus {
  return status.toUpperCase() as AgentStatus;
}

export function triggerTypeToDb(type: string): AgentTriggerType {
  return type.toUpperCase() as AgentTriggerType;
}
