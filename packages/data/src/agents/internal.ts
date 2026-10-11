import type { Prisma } from "../generated/client/client";
import { AgentOperationsError } from "./errors";
import type { OwnerIdentity } from "../clients/types";
import { requireActiveOwnerInTransaction } from "../clients/internal";

export interface AgentProjectionSource {
  id: string;
  name: string;
  status: string;
  archivedAt: Date | null;
  deletedAt: Date | null;
}

const AGENT_PROJECTION_KEY = "agents.self" as const;

/** Maintains the agent graph node in the same transaction as source truth. */
export async function upsertAgentGraphProjection(
  transaction: Prisma.TransactionClient,
  agent: AgentProjectionSource,
): Promise<void> {
  const node = await transaction.graphNode.upsert({
    where: { stableKey: `agent:${agent.id}` },
    create: {
      type: "AGENT",
      entityId: agent.id,
      stableKey: `agent:${agent.id}`,
      label: agent.name,
      metadata: { projectionVersion: 1 },
      archivedAt: agent.archivedAt,
      deletedAt: agent.deletedAt,
    },
    update: {
      label: agent.name,
      metadata: { projectionVersion: 1 },
      archivedAt: agent.archivedAt,
      deletedAt: agent.deletedAt,
    },
  });
  // Agents hub membership is a derived virtual edge from the hub key list; no stored edge needed here.
  void node;
  void AGENT_PROJECTION_KEY;
}

export async function requireActiveAgent(
  transaction: Prisma.TransactionClient,
  agentId: string,
) {
  const agent = await transaction.agent.findFirst({
    where: { id: agentId, deletedAt: null },
    include: {
      currentConfigVersion: true,
      assignments: {
        where: { archivedAt: null, deletedAt: null, agentId },
        select: { project: { select: { clientId: true } }, taskId: true, assigneeType: true },
      },
    },
  });
  if (!agent) throw new AgentOperationsError("NOT_FOUND", "Agent not found.");
  return agent;
}

export async function requireActiveOwnerForAgents(
  transaction: Prisma.TransactionClient,
  identity: OwnerIdentity,
): Promise<void> {
  await requireActiveOwnerInTransaction(transaction, identity);
}

/** Compute today's token usage for budget gating. */
export async function tokensUsedToday(
  transaction: Prisma.TransactionClient,
  agentId: string,
  now: Date,
): Promise<number> {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const runs = await transaction.agentRun.findMany({
    where: {
      agentId,
      deletedAt: null,
      createdAt: { gte: startOfDay, lte: now },
    },
    select: { tokensInput: true, tokensOutput: true },
  });
  return runs.reduce((sum, run) => sum + run.tokensInput + run.tokensOutput, 0);
}

/** Enforce a configured daily token budget before queueing a run. */
export async function assertDailyBudgetAvailable(
  transaction: Prisma.TransactionClient,
  agentId: string,
  dailyTokenBudget: number | null,
  now: Date = new Date(),
): Promise<void> {
  if (dailyTokenBudget == null) return;
  const used = await tokensUsedToday(transaction, agentId, now);
  if (used >= dailyTokenBudget) {
    throw new AgentOperationsError("BUDGET_EXCEEDED", "The agent daily token budget is exhausted for today.");
  }
}
