export interface NormalizedEmailAddress {
  /** Canonical comparison value; dots and plus tags are deliberately retained. */
  readonly normalized: string;
  readonly address: string;
  readonly localPart: string;
  readonly domain: string;
  readonly displayName?: string;
}

export interface ParsedEmailAddressHeader {
  readonly addresses: readonly NormalizedEmailAddress[];
  /** True when at least one non-empty mailbox segment could not be parsed. */
  readonly malformed: boolean;
}

const DOT_ATOM_PART = /^[A-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Z0-9!#$%&'*+/=?^_`{|}~-]+)*$/iu;
const DOMAIN_LABEL = /^[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?$/u;

function unfoldHeader(value: string): string {
  return value.replace(/\r?\n[\t ]+/gu, " ").replace(/[\r\n]/gu, " ").trim();
}

function splitMailboxSegments(value: string): { segments: string[]; structurallyMalformed: boolean } {
  const segments: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  let angleDepth = 0;
  let commentDepth = 0;
  let structurallyMalformed = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && (quoted || commentDepth > 0)) {
      escaped = true;
      continue;
    }
    if (character === '"' && commentDepth === 0) {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (character === "(") {
      commentDepth += 1;
      continue;
    }
    if (character === ")") {
      if (commentDepth === 0) structurallyMalformed = true;
      else commentDepth -= 1;
      continue;
    }
    if (commentDepth > 0) continue;
    if (character === "<") {
      angleDepth += 1;
      if (angleDepth > 1) structurallyMalformed = true;
      continue;
    }
    if (character === ">") {
      if (angleDepth === 0) structurallyMalformed = true;
      else angleDepth -= 1;
      continue;
    }
    if (character === "," && angleDepth === 0) {
      segments.push(value.slice(start, index));
      start = index + 1;
    }
  }

  segments.push(value.slice(start));
  if (quoted || escaped || angleDepth !== 0 || commentDepth !== 0) structurallyMalformed = true;
  return { segments, structurallyMalformed };
}

function findOutsideQuotes(value: string, target: string, fromEnd = false): number {
  let quoted = false;
  let escaped = false;
  let found = -1;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quoted) {
      escaped = true;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && character === target) {
      if (!fromEnd) return index;
      found = index;
    }
  }
  return found;
}

function removeComments(value: string): string | null {
  let result = "";
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      if (depth === 0) result += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && (quoted || depth > 0)) {
      if (depth === 0) result += character;
      escaped = true;
      continue;
    }
    if (character === '"' && depth === 0) {
      quoted = !quoted;
      result += character;
      continue;
    }
    if (!quoted && character === "(") {
      depth += 1;
      continue;
    }
    if (!quoted && character === ")") {
      if (depth === 0) return null;
      depth -= 1;
      continue;
    }
    if (depth === 0) result += character;
  }
  return depth === 0 && !quoted && !escaped ? result : null;
}

function parseLocalPart(value: string): string | null {
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    const inner = value.slice(1, -1);
    if (/[^\x20-\x7E]/u.test(inner)) return null;
    return inner.replace(/\\([\x20-\x7E])/gu, "$1").toLowerCase();
  }
  return DOT_ATOM_PART.test(value) ? value.toLowerCase() : null;
}

function normalizeDomain(value: string): string | null {
  const domain = value.replace(/\.$/u, "").toLowerCase();
  if (domain.length === 0 || domain.length > 253) return null;
  if (/^\[[^\[\]\s]+\]$/u.test(domain)) return domain;
  const labels = domain.split(".");
  if (labels.some((label) => !DOMAIN_LABEL.test(label))) return null;
  return labels.join(".");
}

function unquoteDisplayName(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const withoutComments = removeComments(trimmed)?.trim();
  if (withoutComments === undefined || withoutComments.length === 0) return undefined;
  if (withoutComments.startsWith('"') && withoutComments.endsWith('"')) {
    return withoutComments.slice(1, -1).replace(/\\(["\\])/gu, "$1").trim() || undefined;
  }
  return withoutComments.replace(/\s+/gu, " ");
}

/**
 * Normalizes case and a trailing domain dot, but never applies Gmail-specific
 * dot removal or plus-tag removal. Those distinct aliases remain observable.
 */
export function normalizeEmailAddress(value: string): string | null {
  const candidate = removeComments(unfoldHeader(value));
  if (candidate === null) return null;
  const at = findOutsideQuotes(candidate, "@", true);
  if (at <= 0 || at !== findOutsideQuotes(candidate, "@") || at === candidate.length - 1) return null;
  const localPart = parseLocalPart(candidate.slice(0, at).trim());
  const domain = normalizeDomain(candidate.slice(at + 1).trim());
  if (localPart === null || domain === null) return null;
  const normalized = `${localPart}@${domain}`;
  return normalized.length <= 320 ? normalized : null;
}

function stripGroupSyntax(value: string): string {
  let result = value.trim().replace(/;\s*$/u, "").trim();
  const colon = findOutsideQuotes(result, ":");
  const angle = findOutsideQuotes(result, "<");
  if (colon >= 0 && (angle < 0 || colon < angle)) result = result.slice(colon + 1).trim();
  return result;
}

function parseMailbox(segment: string): NormalizedEmailAddress | null {
  const candidate = stripGroupSyntax(segment);
  if (candidate.length === 0) return null;
  const openAngle = findOutsideQuotes(candidate, "<");
  const closeAngle = findOutsideQuotes(candidate, ">", true);
  let rawAddress: string;
  let displayName: string | undefined;

  if (openAngle >= 0 || closeAngle >= 0) {
    if (openAngle < 0 || closeAngle <= openAngle || candidate.slice(closeAngle + 1).trim().length > 0) return null;
    rawAddress = candidate.slice(openAngle + 1, closeAngle).trim();
    displayName = unquoteDisplayName(candidate.slice(0, openAngle));
  } else {
    rawAddress = candidate;
  }

  const normalized = normalizeEmailAddress(rawAddress);
  if (normalized === null) return null;
  const at = normalized.lastIndexOf("@");
  return {
    normalized,
    address: rawAddress,
    localPart: normalized.slice(0, at),
    domain: normalized.slice(at + 1),
    ...(displayName === undefined ? {} : { displayName }),
  };
}

export function parseEmailAddressHeader(value: string | null | undefined): ParsedEmailAddressHeader {
  if (value === null || value === undefined || value.trim().length === 0) {
    return { addresses: [], malformed: false };
  }
  const split = splitMailboxSegments(unfoldHeader(value));
  const addresses: NormalizedEmailAddress[] = [];
  let malformed = split.structurallyMalformed;
  for (const segment of split.segments) {
    const mailbox = parseMailbox(segment);
    if (mailbox === null) {
      if (stripGroupSyntax(segment).length > 0) malformed = true;
      continue;
    }
    addresses.push(mailbox);
  }
  return { addresses, malformed };
}
