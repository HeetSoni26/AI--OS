import {
  deliveryGateResultSchema,
  normalizedEmailSchema,
  timeEntryCreateSchema,
  websiteSchema,
  type ContactDto,
  type DeliverableDto,
  type DeliveryGateResult,
  type ProjectStatus,
  type TimeAggregation,
  type TimeEntryCreate,
  type TimeEntryDto,
} from "@aios/contracts";
import { ClientDomainError, DeliveryBlockedError, TimeEntryValidationError } from "./errors";

export function normalizeEmailAddress(email: string): string {
  return normalizedEmailSchema.parse(email);
}

/** Lowercases and trims only. Plus tags and dots in the local part are significant and retained. */
export function normalizeEmailAddresses(emails: readonly string[]): string[] {
  return [...new Set(emails.map(normalizeEmailAddress))];
}

export function validateWebsite(website: string): string {
  return websiteSchema.parse(website);
}

export function findPrimaryContact<TContact extends Pick<ContactDto, "id" | "isPrimary">>(
  contacts: readonly TContact[],
): TContact | null {
  const primaryContacts = contacts.filter((contact) => contact.isPrimary);
  if (primaryContacts.length > 1) {
    throw new ClientDomainError("MULTIPLE_PRIMARY_CONTACTS", "A client may have at most one primary contact.", {
      contactIds: primaryContacts.map(({ id }) => id),
    });
  }
  return primaryContacts[0] ?? null;
}

export function selectPrimaryContact<TContact extends Pick<ContactDto, "id" | "isPrimary">>(
  contacts: readonly TContact[],
  primaryContactId: string | null,
): Array<TContact & { isPrimary: boolean }> {
  if (primaryContactId && !contacts.some(({ id }) => id === primaryContactId)) {
    throw new ClientDomainError("INVALID_LIFECYCLE_TRANSITION", "The selected primary contact does not belong to the client.", {
      primaryContactId,
    });
  }
  return contacts.map((contact) => ({ ...contact, isPrimary: contact.id === primaryContactId }));
}

type DeliverableGateInput = Pick<DeliverableDto, "id" | "title" | "isRequired" | "completedAt"> &
  Partial<Pick<DeliverableDto, "archivedAt">>;

export function evaluateDeliveryGate(deliverables: readonly DeliverableGateInput[]): DeliveryGateResult {
  const blockers = deliverables
    .filter((deliverable) => deliverable.isRequired && !deliverable.completedAt && !deliverable.archivedAt)
    .sort((left, right) => left.title.localeCompare(right.title))
    .map((deliverable) => ({
      deliverableId: deliverable.id,
      title: deliverable.title,
      reason: "required_incomplete" as const,
    }));

  return blockers.length > 0
    ? deliveryGateResultSchema.parse({ allowed: false, blockers })
    : deliveryGateResultSchema.parse({ allowed: true, blockers: [] });
}

export function assertDeliveryAllowed(deliverables: readonly DeliverableGateInput[]): void {
  const result = evaluateDeliveryGate(deliverables);
  if (!result.allowed) throw new DeliveryBlockedError(result.blockers);
}

export function assertProjectStatusChangeAllowed(nextStatus: ProjectStatus, deliverables: readonly DeliverableGateInput[]): void {
  if (nextStatus === "delivered") assertDeliveryAllowed(deliverables);
}

export interface DateRangeInput {
  start: Date | string;
  end: Date | string;
}

function asValidDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function validatePositiveDateRange(range: DateRangeInput): { start: Date; end: Date; durationMs: number } {
  const start = asValidDate(range.start);
  const end = asValidDate(range.end);
  if (!start || !end) {
    throw new ClientDomainError("INVALID_DATE_RANGE", "Start and end dates must be valid.");
  }
  const durationMs = end.getTime() - start.getTime();
  if (durationMs <= 0) {
    throw new ClientDomainError("INVALID_DATE_RANGE", "End date must be after start date.");
  }
  return { start, end, durationMs };
}

export interface TimeEntryInterval {
  id?: string;
  projectId: string;
  taskId?: string | null;
  attributionKey: string;
  startedAt: string;
  endedAt?: string | null;
  minutes: number;
  archivedAt?: string | null;
}

function resolveInterval(entry: TimeEntryInterval): { start: Date; end: Date } {
  if (!Number.isInteger(entry.minutes) || entry.minutes <= 0) {
    throw new TimeEntryValidationError("INVALID_TIME_ENTRY", "Time entry duration must be a positive whole number of minutes.", [
      "minutes must be a positive integer",
    ]);
  }
  const start = asValidDate(entry.startedAt);
  const explicitEnd = entry.endedAt ? asValidDate(entry.endedAt) : null;
  if (!start || (entry.endedAt && !explicitEnd)) {
    throw new TimeEntryValidationError("INVALID_TIME_ENTRY", "Time entry dates must be valid.", ["invalid date"]);
  }
  const end = explicitEnd ?? new Date(start.getTime() + entry.minutes * 60_000);
  const durationMs = end.getTime() - start.getTime();
  if (durationMs <= 0) {
    throw new TimeEntryValidationError("INVALID_TIME_ENTRY", "Time entry end must be after its start.", ["non-positive date range"]);
  }
  if (explicitEnd && Math.ceil(durationMs / 60_000) !== entry.minutes) {
    throw new TimeEntryValidationError(
      "INVALID_TIME_ENTRY",
      "Time entry minutes must equal the elapsed duration rounded up to a minute.",
      ["minutes do not match date range"],
    );
  }
  return { start, end };
}

export function timeIntervalsOverlap(left: TimeEntryInterval, right: TimeEntryInterval): boolean {
  const leftInterval = resolveInterval(left);
  const rightInterval = resolveInterval(right);
  return leftInterval.start < rightInterval.end && rightInterval.start < leftInterval.end;
}

export function assertValidTimeEntry(candidate: TimeEntryInterval, existingEntries: readonly TimeEntryInterval[] = []): void {
  resolveInterval(candidate);
  const overlappingEntryIds = existingEntries
    .filter((entry) => !entry.archivedAt && entry.id !== candidate.id && entry.attributionKey === candidate.attributionKey)
    .filter((entry) => timeIntervalsOverlap(candidate, entry))
    .map((entry) => entry.id)
    .filter((id): id is string => Boolean(id));

  if (overlappingEntryIds.length > 0) {
    throw new TimeEntryValidationError(
      "TIME_ENTRY_OVERLAP",
      "A time entry overlaps another entry for the same attribution.",
      ["overlapping time range"],
      overlappingEntryIds,
    );
  }
}

export function parseTimeEntry(input: unknown): TimeEntryCreate {
  return timeEntryCreateSchema.parse(input);
}

export type TimeAggregationInput = Pick<TimeEntryDto, "source" | "minutes" | "hourlyRate"> &
  Partial<Pick<TimeEntryDto, "archivedAt">>;

export function aggregateProjectTime(projectId: string, entries: readonly TimeAggregationInput[]): TimeAggregation {
  let manualMinutes = 0;
  let agentRunMinutes = 0;
  let billableAmount = 0;

  for (const entry of entries) {
    if (entry.archivedAt) continue;
    if (!Number.isInteger(entry.minutes) || entry.minutes <= 0) {
      throw new TimeEntryValidationError("INVALID_TIME_ENTRY", "Cannot aggregate a non-positive time entry.", [
        "minutes must be a positive integer",
      ]);
    }
    if (entry.source === "manual") manualMinutes += entry.minutes;
    else agentRunMinutes += entry.minutes;
    if (entry.hourlyRate !== null && entry.hourlyRate !== undefined) {
      billableAmount += (entry.minutes / 60) * entry.hourlyRate;
    }
  }

  return {
    projectId,
    totalMinutes: manualMinutes + agentRunMinutes,
    manualMinutes,
    agentRunMinutes,
    billableAmount: Math.round((billableAmount + Number.EPSILON) * 100) / 100,
  };
}
