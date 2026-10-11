import {
  clientDeletionImpactSchema,
  clientDeletionRequestSchema,
  type ClientDeletionImpact,
  type ClientDeletionPlan,
  type ClientDeletionRequest,
  type DeletionImpactItem,
} from "@aios/contracts";
import { ClientDomainError, LifecyclePolicyError } from "./errors";

export const CLIENT_DELETION_RECOVERY_WINDOW_DAYS = 7 as const;
export const CLIENT_DELETION_RECOVERY_WINDOW_MS = CLIENT_DELETION_RECOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1_000;

export interface ClientLifecycleState {
  archivedAt: string | null;
  deletedAt: string | null;
}

export interface ClientDeletionState extends ClientLifecycleState {
  deletionPlan: ClientDeletionPlan | null;
}

export function assertClientCanBeArchived(state: ClientLifecycleState): void {
  if (state.deletedAt) {
    throw new LifecyclePolicyError("INVALID_LIFECYCLE_TRANSITION", "A permanently deleted client cannot be archived.");
  }
  if (state.archivedAt) {
    throw new LifecyclePolicyError("INVALID_LIFECYCLE_TRANSITION", "Client is already archived.");
  }
}

export function archiveClient(state: ClientLifecycleState, now = new Date()): ClientLifecycleState {
  assertClientCanBeArchived(state);
  return { ...state, archivedAt: now.toISOString() };
}

export function assertClientCanBeRecovered(state: ClientDeletionState, now = new Date()): void {
  if (!state.archivedAt || state.deletedAt) {
    throw new LifecyclePolicyError("INVALID_LIFECYCLE_TRANSITION", "Only an archived, non-deleted client can be recovered.");
  }
  const plan = state.deletionPlan;
  if (!plan) return;
  if (plan.status !== "pending" && plan.status !== "cancelled" && plan.status !== "recovered") {
    throw new LifecyclePolicyError("INVALID_LIFECYCLE_TRANSITION", `Deletion plan in ${plan.status} state cannot be recovered.`);
  }
  if (plan.status === "pending" && new Date(plan.notBefore) <= now) {
    throw new LifecyclePolicyError("DELETION_RECOVERY_EXPIRED", "The seven-day deletion recovery window has expired.", {
      notBefore: plan.notBefore,
    });
  }
}

export function recoverClient(state: ClientDeletionState, now = new Date()): ClientDeletionState {
  assertClientCanBeRecovered(state, now);
  const deletionPlan = state.deletionPlan?.status === "pending"
    ? { ...state.deletionPlan, status: "recovered" as const, cancelledAt: now.toISOString() }
    : state.deletionPlan;
  return { ...state, archivedAt: null, deletionPlan };
}

export function deletionNotBefore(requestedAt = new Date()): Date {
  return new Date(requestedAt.getTime() + CLIENT_DELETION_RECOVERY_WINDOW_MS);
}

export interface ClientDeletionPlanDraftInput {
  id: string;
  clientId: string;
  currentState: ClientLifecycleState;
  request: ClientDeletionRequest;
  impact: ClientDeletionImpact;
  requestedAt?: Date;
  version?: number;
}

export function createClientDeletionPlan(input: ClientDeletionPlanDraftInput): ClientDeletionPlan {
  const request = clientDeletionRequestSchema.parse(input.request);
  const impact = clientDeletionImpactSchema.parse(input.impact);
  if (request.clientId !== input.clientId || impact.clientId !== input.clientId) {
    throw new LifecyclePolicyError("DELETION_BLOCKED", "Deletion request, impact, and client IDs must match.");
  }
  if (!input.currentState.archivedAt || input.currentState.deletedAt) {
    throw new LifecyclePolicyError("DELETION_BLOCKED", "Client must be archived and not deleted before permanent deletion is scheduled.");
  }
  if (impact.legalHold || impact.blockers.length > 0) {
    throw new LifecyclePolicyError("DELETION_BLOCKED", "Client deletion is blocked by its impact assessment.", {
      legalHold: impact.legalHold,
      blockers: impact.blockers,
    });
  }
  const requestedAt = input.requestedAt ?? new Date();
  return {
    id: input.id,
    clientId: input.clientId,
    status: "pending",
    requestedAt: requestedAt.toISOString(),
    notBefore: deletionNotBefore(requestedAt).toISOString(),
    cancelledAt: null,
    completedAt: null,
    impact,
    version: input.version ?? 1,
  };
}

export function assertClientDeletionCanExecute(plan: ClientDeletionPlan, now = new Date()): void {
  if (plan.status !== "pending") {
    throw new LifecyclePolicyError("DELETION_BLOCKED", "Only a pending deletion plan can execute.", { status: plan.status });
  }
  if (plan.impact.legalHold || plan.impact.blockers.length > 0) {
    throw new LifecyclePolicyError("DELETION_BLOCKED", "Deletion impact assessment contains blockers.", {
      legalHold: plan.impact.legalHold,
      blockers: plan.impact.blockers,
    });
  }
  if (new Date(plan.notBefore) > now) {
    throw new LifecyclePolicyError("DELETION_BLOCKED", "The seven-day recovery window has not expired.", {
      notBefore: plan.notBefore,
    });
  }
}

export function cancelClientDeletion(plan: ClientDeletionPlan, now = new Date()): ClientDeletionPlan {
  if (plan.status !== "pending") {
    throw new LifecyclePolicyError("INVALID_LIFECYCLE_TRANSITION", "Only a pending deletion plan can be cancelled.", {
      status: plan.status,
    });
  }
  if (new Date(plan.notBefore) <= now) {
    throw new LifecyclePolicyError("DELETION_RECOVERY_EXPIRED", "The seven-day deletion recovery window has expired.");
  }
  return { ...plan, status: "cancelled", cancelledAt: now.toISOString(), version: plan.version + 1 };
}

export interface DeletionImpactContribution {
  items?: readonly DeletionImpactItem[];
  blockers?: readonly string[];
  legalHold?: boolean;
}

export interface ClientDeletionImpactContributor {
  readonly key: string;
  assess(clientId: string): Promise<DeletionImpactContribution> | DeletionImpactContribution;
}

/** Composes deletion impact without coupling the client domain to later data packages. */
export class ClientDeletionImpactRegistry {
  readonly #contributors = new Map<string, ClientDeletionImpactContributor>();

  register(contributor: ClientDeletionImpactContributor): () => void {
    if (this.#contributors.has(contributor.key)) {
      throw new ClientDomainError(
        "DUPLICATE_DELETION_IMPACT_CONTRIBUTOR",
        `Deletion impact contributor '${contributor.key}' is already registered.`,
      );
    }
    this.#contributors.set(contributor.key, contributor);
    return () => this.#contributors.delete(contributor.key);
  }

  get contributorKeys(): readonly string[] {
    return [...this.#contributors.keys()].sort();
  }

  async assess(clientId: string): Promise<ClientDeletionImpact> {
    const contributions = await Promise.all([...this.#contributors.values()].map((contributor) => contributor.assess(clientId)));
    const impact = {
      clientId,
      items: contributions.flatMap(({ items }) => items ?? []),
      blockers: [...new Set(contributions.flatMap(({ blockers }) => blockers ?? []))],
      legalHold: contributions.some(({ legalHold }) => legalHold === true),
    };
    return clientDeletionImpactSchema.parse(impact);
  }
}
