export type LogLevel = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|api[_-]?key|service[_-]?role)/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, SENSITIVE_KEY.test(key) ? "[REDACTED]" : redact(entry)]),
    );
  }
  if (typeof value === "string" && /Bearer\s+\S+/i.test(value)) return value.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
  return value;
}

export function createCorrelationId(): string {
  return crypto.randomUUID();
}

export function redactMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return redact(metadata) as Record<string, unknown>;
}

export function log(level: LogLevel, message: string, metadata: Record<string, unknown> = {}): void {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...redactMetadata(metadata),
  };
  const writer = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  writer(JSON.stringify(entry));
}
