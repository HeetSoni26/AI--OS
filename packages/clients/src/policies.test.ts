import { describe, expect, it } from "vitest";
import type { ContactDto, DeliverableDto, TimeEntryDto } from "@aios/contracts";
import {
  DeliveryBlockedError,
  TimeEntryValidationError,
  aggregateProjectTime,
  assertDeliveryAllowed,
  assertProjectStatusChangeAllowed,
  assertValidTimeEntry,
  evaluateDeliveryGate,
  findPrimaryContact,
  normalizeEmailAddress,
  selectPrimaryContact,
  timeIntervalsOverlap,
  validatePositiveDateRange,
  validateWebsite,
} from "./index";

const ids = {
  project: "11111111-1111-4111-8111-111111111111",
  first: "22222222-2222-4222-8222-222222222222",
  second: "33333333-3333-4333-8333-333333333333",
};

function deliverable(overrides: Partial<DeliverableDto> = {}): DeliverableDto {
  return {
    id: ids.first,
    projectId: ids.project,
    title: "Production handoff",
    description: null,
    position: 0,
    isRequired: true,
    completedAt: null,
    archivedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function contact(id: string, isPrimary: boolean): Pick<ContactDto, "id" | "isPrimary"> {
  return { id, isPrimary };
}

describe("identity and validation policies", () => {
  it("normalizes email without stripping meaningful Gmail dots or plus tags", () => {
    expect(normalizeEmailAddress(" First.Last+Client@Example.COM ")).toBe("first.last+client@example.com");
    expect(normalizeEmailAddress("first.last@example.com")).not.toBe(normalizeEmailAddress("firstlast@example.com"));
    expect(normalizeEmailAddress("first+agency@example.com")).not.toBe(normalizeEmailAddress("first@example.com"));
  });

  it("uses the shared website schema as the domain boundary", () => {
    expect(validateWebsite("https://agency.example/path")).toBe("https://agency.example/path");
    expect(() => validateWebsite("file:///private/client.txt")).toThrow();
  });

  it("supports zero or one primary contact and rejects corrupt multiple-primary state", () => {
    expect(findPrimaryContact([contact(ids.first, false), contact(ids.second, false)])).toBeNull();
    expect(findPrimaryContact([contact(ids.first, true), contact(ids.second, false)])?.id).toBe(ids.first);
    expect(() => findPrimaryContact([contact(ids.first, true), contact(ids.second, true)])).toThrow(/at most one/);
  });

  it("changes primary contact atomically in a pure projection", () => {
    expect(selectPrimaryContact([contact(ids.first, true), contact(ids.second, false)], ids.second)).toEqual([
      { id: ids.first, isPrimary: false },
      { id: ids.second, isPrimary: true },
    ]);
    expect(selectPrimaryContact([contact(ids.first, true)], null)).toEqual([{ id: ids.first, isPrimary: false }]);
    expect(() => selectPrimaryContact([contact(ids.first, false)], ids.second)).toThrow(/does not belong/);
  });
});

describe("delivery policies", () => {
  it("returns every active required incomplete deliverable as a blocker", () => {
    const result = evaluateDeliveryGate([
      deliverable(),
      deliverable({ id: ids.second, title: "Optional guide", position: 1, isRequired: false }),
      deliverable({ id: "44444444-4444-4444-8444-444444444444", title: "Archived blocker", archivedAt: "2026-08-01T01:00:00.000Z" }),
    ]);
    expect(result).toEqual({
      allowed: false,
      blockers: [{ deliverableId: ids.first, title: "Production handoff", reason: "required_incomplete" }],
    });
  });

  it("allows delivery only after all required deliverables are complete", () => {
    const completed = deliverable({ completedAt: "2026-08-01T01:00:00.000Z" });
    expect(evaluateDeliveryGate([completed])).toEqual({ allowed: true, blockers: [] });
    expect(() => assertDeliveryAllowed([completed])).not.toThrow();
    expect(() => assertProjectStatusChangeAllowed("review", [deliverable()])).not.toThrow();
  });

  it("throws a typed delivery error that retains accessible blockers", () => {
    try {
      assertProjectStatusChangeAllowed("delivered", [deliverable()]);
      throw new Error("Expected delivery to be blocked");
    } catch (error) {
      expect(error).toBeInstanceOf(DeliveryBlockedError);
      expect((error as DeliveryBlockedError).code).toBe("DELIVERY_BLOCKED");
      expect((error as DeliveryBlockedError).blockers[0]?.title).toBe("Production handoff");
    }
  });
});

describe("time and date policies", () => {
  it("accepts positive ranges and rejects invalid, zero, and negative ranges", () => {
    expect(validatePositiveDateRange({ start: "2026-08-01T10:00:00Z", end: "2026-08-01T10:30:00Z" }).durationMs).toBe(1_800_000);
    expect(() => validatePositiveDateRange({ start: "invalid", end: "2026-08-01T10:30:00Z" })).toThrow(/valid/);
    expect(() => validatePositiveDateRange({ start: "2026-08-01T10:30:00Z", end: "2026-08-01T10:30:00Z" })).toThrow(/after/);
    expect(() => validatePositiveDateRange({ start: "2026-08-01T11:00:00Z", end: "2026-08-01T10:30:00Z" })).toThrow(/after/);
  });

  it("detects true overlap but permits adjacent entries and different attribution", () => {
    const first = { id: ids.first, projectId: ids.project, attributionKey: "owner", startedAt: "2026-08-01T10:00:00Z", endedAt: "2026-08-01T11:00:00Z", minutes: 60 };
    const overlapping = { id: ids.second, projectId: ids.project, attributionKey: "owner", startedAt: "2026-08-01T10:30:00Z", endedAt: "2026-08-01T11:30:00Z", minutes: 60 };
    const adjacent = { ...overlapping, startedAt: "2026-08-01T11:00:00Z", endedAt: "2026-08-01T12:00:00Z" };
    expect(timeIntervalsOverlap(first, overlapping)).toBe(true);
    expect(timeIntervalsOverlap(first, adjacent)).toBe(false);
    expect(() => assertValidTimeEntry(overlapping, [first])).toThrow(TimeEntryValidationError);
    expect(() => assertValidTimeEntry({ ...overlapping, attributionKey: "agent:1" }, [first])).not.toThrow();
    expect(() => assertValidTimeEntry(adjacent, [first])).not.toThrow();
  });

  it("rejects non-positive and inconsistent elapsed minutes", () => {
    const base = { projectId: ids.project, attributionKey: "owner", startedAt: "2026-08-01T10:00:00Z", endedAt: "2026-08-01T11:00:00Z", minutes: 60 };
    expect(() => assertValidTimeEntry({ ...base, minutes: -1 })).toThrow(/positive/);
    expect(() => assertValidTimeEntry({ ...base, minutes: 30 })).toThrow(/must equal/);
  });

  it("aggregates visible manual and agent-run time with billable attribution", () => {
    const entries: Array<Pick<TimeEntryDto, "source" | "minutes" | "hourlyRate" | "archivedAt">> = [
      { source: "manual", minutes: 90, hourlyRate: 100, archivedAt: null },
      { source: "agent_run", minutes: 30, hourlyRate: 120, archivedAt: null },
      { source: "manual", minutes: 60, hourlyRate: 999, archivedAt: "2026-08-01T00:00:00.000Z" },
    ];
    expect(aggregateProjectTime(ids.project, entries)).toEqual({
      projectId: ids.project,
      totalMinutes: 120,
      manualMinutes: 90,
      agentRunMinutes: 30,
      billableAmount: 210,
    });
  });
});
