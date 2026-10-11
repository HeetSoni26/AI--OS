import type {
  ClientDeletionParticipant,
  CustomDeletionImpact,
  DeletionImpactPlan,
  DeletionParticipantContext,
  PlannedDeletionParticipant,
} from "./contracts";

function compareParticipants(
  left: ClientDeletionParticipant,
  right: ClientDeletionParticipant,
): number {
  return left.order - right.order || left.name.localeCompare(right.name, "en");
}

export class DeletionParticipantError extends Error {
  readonly participantName: string;
  readonly cause: unknown;

  constructor(participantName: string, cause: unknown) {
    super(`Deletion participant ${participantName} failed.`);
    this.name = "DeletionParticipantError";
    this.participantName = participantName;
    this.cause = cause;
  }
}

/** Versioned, deterministic registry for planning and executing client deletion. */
export class DeletionParticipantRegistry {
  readonly version: number;
  readonly participants: readonly ClientDeletionParticipant[];

  constructor(version: number, participants: readonly ClientDeletionParticipant[]) {
    if (!Number.isInteger(version) || version < 1) {
      throw new Error("Deletion participant registry version must be a positive integer.");
    }
    const names = new Set<string>();
    for (const participant of participants) {
      if (!participant.name.trim()) throw new Error("Deletion participant name is required.");
      if (!Number.isFinite(participant.order)) {
        throw new Error(`Deletion participant ${participant.name} has an invalid order.`);
      }
      if (names.has(participant.name)) {
        throw new Error(`Duplicate deletion participant name: ${participant.name}.`);
      }
      names.add(participant.name);
    }
    this.version = version;
    this.participants = [...participants].sort(compareParticipants);
  }

  async plan(context: DeletionParticipantContext): Promise<DeletionImpactPlan> {
    const planned: PlannedDeletionParticipant[] = [];
    for (const participant of this.participants) {
      try {
        const impact = await participant.plan({ ...context, dryRun: true });
        if (impact.kind !== participant.kind) {
          throw new Error(
            `Deletion participant ${participant.name} returned impact kind ${impact.kind}, expected ${participant.kind}.`,
          );
        }
        planned.push({ name: participant.name, order: participant.order, impact });
      } catch (error) {
        if (error instanceof DeletionParticipantError) throw error;
        throw new DeletionParticipantError(participant.name, error);
      }
    }
    return {
      registryVersion: this.version,
      requestId: context.requestId,
      participants: planned,
    };
  }

  async executeParticipant(
    name: string,
    context: DeletionParticipantContext,
    impact: CustomDeletionImpact,
  ): Promise<void> {
    const participant = this.participants.find((candidate) => candidate.name === name);
    if (!participant) throw new Error(`Deletion participant is not registered: ${name}.`);
    try {
      await participant.execute(
        context,
        impact,
        `deletion:${context.requestId}:participant:${participant.name}:v${this.version}`,
      );
    } catch (error) {
      throw new DeletionParticipantError(participant.name, error);
    }
  }
}
