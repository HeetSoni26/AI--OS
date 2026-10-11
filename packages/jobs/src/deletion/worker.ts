import { addMilliseconds, exponentialBackoff, type BackoffPolicy } from "../backoff";
import { ClaimLostError, safeErrorMessage } from "../errors";
import type { RunOnceWorker, WorkerBatchResult } from "../worker";
import type {
  ClaimedDeletionRequest,
  DeletionEligibility,
  DeletionIneligibility,
  DeletionRepository,
} from "./contracts";
import { DeletionParticipantError, DeletionParticipantRegistry } from "./registry";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;

export interface DeletionWorkerOptions {
  readonly repository: DeletionRepository;
  readonly registry: DeletionParticipantRegistry;
  readonly batchSize?: number;
  readonly leaseTimeoutMs?: number;
  readonly maximumAttempts?: number;
  readonly backoff?: BackoffPolicy;
  readonly clock?: () => Date;
}

export function evaluateDeletionEligibility(
  request: ClaimedDeletionRequest,
  registryVersion: number,
  now: Date,
): DeletionEligibility | DeletionIneligibility {
  if (request.status !== "executing") return { eligible: false, reason: "status" };
  if (request.confirmedAt === null) return { eligible: false, reason: "unconfirmed" };
  if (request.legalHold) return { eligible: false, reason: "legal_hold" };
  if (request.impactRegistryVersion !== registryVersion) {
    return { eligible: false, reason: "registry_version" };
  }
  const sevenDayDeadline = new Date(request.requestedAt.getTime() + SEVEN_DAYS_MS);
  const retryAt = new Date(Math.max(
    sevenDayDeadline.getTime(),
    request.executeAfter.getTime(),
    request.recoveryUntil.getTime(),
  ));
  if (now < retryAt) return { eligible: false, reason: "recovery_window", retryAt };
  return { eligible: true };
}

export class DeletionWorker implements RunOnceWorker<WorkerBatchResult> {
  private readonly repository: DeletionRepository;
  private readonly registry: DeletionParticipantRegistry;
  private readonly batchSize: number;
  private readonly leaseTimeoutMs: number;
  private readonly maximumAttempts: number;
  private readonly backoff: BackoffPolicy;
  private readonly clock: () => Date;

  constructor(options: DeletionWorkerOptions) {
    this.repository = options.repository;
    this.registry = options.registry;
    this.batchSize = options.batchSize ?? 10;
    this.leaseTimeoutMs = options.leaseTimeoutMs ?? 5 * 60_000;
    this.maximumAttempts = options.maximumAttempts ?? 5;
    this.backoff = options.backoff ?? exponentialBackoff();
    this.clock = options.clock ?? (() => new Date());
  }

  async runOnce(signal?: AbortSignal): Promise<WorkerBatchResult> {
    if (signal?.aborted) return { claimed: 0, succeeded: 0, failed: 0, deferred: 0 };
    const claims = await this.repository.claimDue({
      now: this.clock(),
      limit: this.batchSize,
      leaseTimeoutMs: this.leaseTimeoutMs,
    });
    let succeeded = 0;
    let failed = 0;
    let deferred = 0;
    for (const claim of claims) {
      if (signal?.aborted) break;
      const outcome = await this.processClaim(claim, signal);
      if (outcome === "succeeded") succeeded += 1;
      else if (outcome === "failed") failed += 1;
      else deferred += 1;
    }
    return { claimed: claims.length, succeeded, failed, deferred };
  }

  private async processClaim(
    initialClaim: ClaimedDeletionRequest,
    signal?: AbortSignal,
  ): Promise<"succeeded" | "failed" | "deferred"> {
    let claim = initialClaim;
    try {
      claim = await this.requireEligibleClaim(claim);
      const context = {
        requestId: claim.id,
        entityType: claim.entityType,
        entityId: claim.entityId,
        requestedBy: claim.requestedBy,
        impactManifest: claim.impactManifest,
        registryVersion: this.registry.version,
        ...(signal === undefined ? {} : { signal }),
      };
      const plan = await this.registry.plan(context);
      for (const planned of plan.participants) {
        if (signal?.aborted) throw signal.reason ?? new Error("Deletion worker was stopped.");
        claim = await this.requireEligibleClaim(claim);
        await this.registry.executeParticipant(planned.name, context, planned.impact);
      }
      claim = await this.requireEligibleClaim(claim);
      await this.repository.recordCompletion(claim, plan, this.clock());
      return "succeeded";
    } catch (error) {
      if (error instanceof ClaimLostError) return "deferred";
      if (error instanceof IneligibleDeletionError) {
        if (error.ineligibility.reason === "registry_version") {
          await this.repository.recordFailure(error.claim, {
            error: `Deletion impact registry version ${error.claim.impactRegistryVersion} does not match worker version ${this.registry.version}.`,
            failedAt: this.clock(),
            attempt: error.claim.failureAttempt + 1,
          });
          return "failed";
        }
        await this.repository.releaseIneligible(error.claim, error.ineligibility, this.clock());
        return "deferred";
      }
      const attempt = claim.failureAttempt + 1;
      const retryAt = attempt < this.maximumAttempts
        ? addMilliseconds(this.clock(), this.backoff.delayMs(attempt))
        : undefined;
      await this.repository.recordFailure(claim, {
        error: safeErrorMessage(
          error instanceof DeletionParticipantError && error.cause instanceof Error
            ? error.cause
            : error,
        ),
        ...(error instanceof DeletionParticipantError
          ? { failedParticipant: error.participantName }
          : {}),
        failedAt: this.clock(),
        attempt,
        ...(retryAt === undefined ? {} : { retryAt }),
      });
      return "failed";
    }
  }

  private async requireEligibleClaim(
    claim: ClaimedDeletionRequest,
  ): Promise<ClaimedDeletionRequest> {
    const current = await this.repository.recheckClaim(claim, this.clock());
    if (!current) throw new ClaimLostError("deletion", claim.id);
    const eligibility = evaluateDeletionEligibility(current, this.registry.version, this.clock());
    if (!eligibility.eligible) throw new IneligibleDeletionError(current, eligibility);
    return current;
  }
}

class IneligibleDeletionError extends Error {
  constructor(
    readonly claim: ClaimedDeletionRequest,
    readonly ineligibility: DeletionIneligibility,
  ) {
    super(`Deletion request is ineligible: ${ineligibility.reason}.`);
    this.name = "IneligibleDeletionError";
  }
}
