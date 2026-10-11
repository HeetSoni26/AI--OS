export const CORE_DELETION_IMPACT_KINDS = [
  "database_records",
  "storage_objects",
  "cache_keys",
  "provider_references",
] as const;

export type CoreDeletionImpactKind = (typeof CORE_DELETION_IMPACT_KINDS)[number];

export interface DatabaseRecordsImpact {
  readonly kind: "database_records";
  readonly records: readonly { readonly table: string; readonly count: number }[];
}

export interface StorageObjectsImpact {
  readonly kind: "storage_objects";
  readonly objects: readonly { readonly bucket: string; readonly count: number }[];
}

export interface CacheKeysImpact {
  readonly kind: "cache_keys";
  readonly keys: readonly { readonly namespace: string; readonly count: number }[];
}

export interface ProviderReferencesImpact {
  readonly kind: "provider_references";
  readonly references: readonly { readonly provider: string; readonly count: number }[];
}

export type CoreDeletionImpact =
  | DatabaseRecordsImpact
  | StorageObjectsImpact
  | CacheKeysImpact
  | ProviderReferencesImpact;

export interface CustomDeletionImpact {
  readonly kind: string;
}

export interface DeletionParticipantContext {
  readonly requestId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly requestedBy: string;
  readonly impactManifest: unknown;
  readonly registryVersion: number;
  readonly signal?: AbortSignal;
}

/**
 * A participant must make execute idempotent for the supplied idempotencyKey.
 * Retries intentionally replay participants because a prior acknowledgement may
 * have been lost after the destructive action committed.
 */
export interface DeletionPlanningContext extends DeletionParticipantContext {
  /** Planning is a read-only impact inventory and must not delete anything. */
  readonly dryRun: true;
}

export interface ClientDeletionParticipant<TImpact extends CustomDeletionImpact = CustomDeletionImpact> {
  readonly name: string;
  readonly order: number;
  readonly kind: TImpact["kind"];
  plan(context: DeletionPlanningContext): Promise<TImpact>;
  execute(
    context: DeletionParticipantContext,
    impact: TImpact,
    idempotencyKey: string,
  ): Promise<void>;
}

export interface DatabaseRecordsDeletionParticipant
  extends ClientDeletionParticipant<DatabaseRecordsImpact> {
  readonly kind: "database_records";
}

export interface StorageObjectsDeletionParticipant
  extends ClientDeletionParticipant<StorageObjectsImpact> {
  readonly kind: "storage_objects";
}

export interface CacheKeysDeletionParticipant extends ClientDeletionParticipant<CacheKeysImpact> {
  readonly kind: "cache_keys";
}

export interface ProviderReferencesDeletionParticipant
  extends ClientDeletionParticipant<ProviderReferencesImpact> {
  readonly kind: "provider_references";
}

export interface PlannedDeletionParticipant {
  readonly name: string;
  readonly order: number;
  readonly impact: CustomDeletionImpact;
}

export interface DeletionImpactPlan {
  readonly registryVersion: number;
  readonly requestId: string;
  readonly participants: readonly PlannedDeletionParticipant[];
}

export type DeletionRequestStatus =
  | "pending"
  | "cancelled"
  | "executing"
  | "completed"
  | "failed"
  | "recovered";

export interface ClaimedDeletionRequest {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly status: DeletionRequestStatus;
  readonly requestedBy: string;
  readonly requestedAt: Date;
  readonly executeAfter: Date;
  readonly recoveryUntil: Date;
  readonly impactManifest: unknown;
  readonly impactRegistryVersion: number;
  readonly legalHold: boolean;
  readonly confirmedAt: Date | null;
  readonly failureAttempt: number;
  /** Opaque optimistic lease token supplied by the repository. */
  readonly claimToken: string;
}

export type DeletionIneligibilityReason =
  | "status"
  | "unconfirmed"
  | "legal_hold"
  | "recovery_window"
  | "registry_version";

export interface DeletionIneligibility {
  readonly eligible: false;
  readonly reason: DeletionIneligibilityReason;
  readonly retryAt?: Date;
}

export interface DeletionEligibility {
  readonly eligible: true;
}

export interface DeletionFailureRecord {
  readonly error: string;
  readonly failedParticipant?: string;
  readonly failedAt: Date;
  readonly attempt: number;
  readonly retryAt?: Date;
}

export interface DeletionRepository {
  claimDue(input: {
    readonly now: Date;
    readonly limit: number;
    readonly leaseTimeoutMs: number;
  }): Promise<readonly ClaimedDeletionRequest[]>;
  /** Rechecks and renews the optimistic lease. Null means the claim was lost. */
  recheckClaim(claim: ClaimedDeletionRequest, now: Date): Promise<ClaimedDeletionRequest | null>;
  releaseIneligible(
    claim: ClaimedDeletionRequest,
    ineligibility: DeletionIneligibility,
    now: Date,
  ): Promise<void>;
  recordFailure(claim: ClaimedDeletionRequest, failure: DeletionFailureRecord): Promise<void>;
  recordCompletion(
    claim: ClaimedDeletionRequest,
    plan: DeletionImpactPlan,
    completedAt: Date,
  ): Promise<void>;
}
