const sensitiveKey = /(authorization|cookie|password|secret|token|api[_-]?key|financial[_-]?account|raw[_-]?payload)/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitiveKey.test(key) ? "[REDACTED]" : sanitize(item)]));
  }
  return value;
}

export type AuditMutation = {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  correlationId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

export type AuditEventDraft = Omit<AuditMutation, "before" | "after"> & {
  changes: Record<string, { before: unknown; after: unknown }>;
  occurredAt: string;
};

export function createAuditEvent(mutation: AuditMutation, occurredAt = new Date()): AuditEventDraft {
  const before = sanitize(mutation.before ?? {}) as Record<string, unknown>;
  const after = sanitize(mutation.after ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes = Object.fromEntries(
    [...keys]
      .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      .map((key) => [key, { before: before[key] ?? null, after: after[key] ?? null }]),
  );
  return { actorId: mutation.actorId, action: mutation.action, entityType: mutation.entityType, entityId: mutation.entityId, correlationId: mutation.correlationId, changes, occurredAt: occurredAt.toISOString() };
}
