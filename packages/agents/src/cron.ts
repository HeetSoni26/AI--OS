const FIELD_RANGES = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 6 },
] as const;

interface ParsedField {
  values: Set<number>;
}

function parseField(field: string, range: { min: number; max: number }): ParsedField {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const [base, stepRaw] = part.split("/");
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (!Number.isInteger(step) || step < 1) throw new RangeError(`Invalid cron step in "${part}".`);
    if (base === "*") {
      for (let value = range.min; value <= range.max; value += step) values.add(value);
      continue;
    }
    const segments = base.split("-");
    if (segments.length === 1) {
      const value = Number(segments[0]);
      if (!Number.isInteger(value) || value < range.min || value > range.max) throw new RangeError(`Cron value ${base} out of range.`);
      if (step === 1) {
        values.add(value);
      } else {
        for (let current = value; current <= range.max; current += step) values.add(current);
      }
      continue;
    }
    if (segments.length === 2) {
      const start = Number(segments[0]);
      const end = Number(segments[1]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start < range.min || end > range.max) {
        throw new RangeError(`Invalid cron range "${base}".`);
      }
      for (let value = start; value <= end; value += step) values.add(value);
      continue;
    }
    throw new RangeError(`Invalid cron field "${field}".`);
  }
  if (values.size === 0) throw new RangeError(`Cron field "${field}" matched nothing.`);
  return { values };
}

export interface ParsedCronExpression {
  minute: ParsedField;
  hour: ParsedField;
  dayOfMonth: ParsedField;
  month: ParsedField;
  dayOfWeek: ParsedField;
}

/** Parses a standard 5-field cron expression (minute hour day-of-month month day-of-week). */
export function parseCronExpression(expression: string): ParsedCronExpression {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new RangeError("Cron expressions must have exactly 5 fields.");
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  return {
    minute: parseField(minute!, FIELD_RANGES[0]!),
    hour: parseField(hour!, FIELD_RANGES[1]!),
    dayOfMonth: parseField(dayOfMonth!, FIELD_RANGES[2]!),
    month: parseField(month!, FIELD_RANGES[3]!),
    dayOfWeek: parseField(dayOfWeek!, FIELD_RANGES[4]!),
  };
}

function matches(cron: ParsedCronExpression, date: Date): boolean {
  // Vixie cron semantics: when both day fields are restricted, either may match.
  const domRestricted = cron.dayOfMonth.values.size !== daysInMonthValues(date).size;
  const dowRestricted = cron.dayOfWeek.values.size !== 7;
  const dayMatches = domRestricted && dowRestricted
    ? cron.dayOfMonth.values.has(date.getUTCDate()) || cron.dayOfWeek.values.has(date.getUTCDay())
    : cron.dayOfMonth.values.has(date.getUTCDate()) && cron.dayOfWeek.values.has(date.getUTCDay());
  return cron.month.values.has(date.getUTCMonth() + 1)
    && dayMatches
    && cron.hour.values.has(date.getUTCHours())
    && cron.minute.values.has(date.getUTCMinutes());
}

function daysInMonthValues(date: Date): Set<number> {
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return new Set(Array.from({ length: lastDay }, (_, index) => index + 1));
}

/**
 * Returns the next fire time strictly after `after` (UTC), or null when no
 * fire time exists within the search horizon (about 4 years, e.g. Feb 31).
 */
export function nextCronFire(expression: string, after: Date = new Date()): Date | null {
  const cron = parseCronExpression(expression);
  const cursor = new Date(after.getTime());
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  const horizon = new Date(after.getTime() + 4 * 366 * 24 * 60 * 60 * 1_000);
  while (cursor <= horizon) {
    if (!cron.month.values.has(cursor.getUTCMonth() + 1)) {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
      cursor.setUTCHours(0, 0, 0, 0);
      continue;
    }
    if (!matches(cron, cursor)) {
      cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
      continue;
    }
    return new Date(cursor.getTime());
  }
  return null;
}

/** Minute bucket key used for idempotent scheduled dispatches. */
export function minuteBucket(date: Date = new Date()): string {
  return date.toISOString().slice(0, 16);
}
