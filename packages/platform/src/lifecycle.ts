const RECOVERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type ArchiveState = { archivedAt: Date | null; deletionRequestedAt: Date | null; deleteNotBefore: Date | null };

export function archive(now = new Date()): ArchiveState {
  return { archivedAt: now, deletionRequestedAt: null, deleteNotBefore: null };
}

export function schedulePermanentDeletion(state: ArchiveState, now = new Date()): ArchiveState {
  if (!state.archivedAt) throw new Error("A record must be archived before permanent deletion is scheduled.");
  return { ...state, deletionRequestedAt: now, deleteNotBefore: new Date(now.getTime() + RECOVERY_WINDOW_MS) };
}

export function canRecover(state: ArchiveState, now = new Date()): boolean {
  return Boolean(state.archivedAt && (!state.deleteNotBefore || state.deleteNotBefore > now));
}

export function recover(state: ArchiveState, now = new Date()): ArchiveState {
  if (!canRecover(state, now)) throw new Error("The recovery window has expired.");
  return { archivedAt: null, deletionRequestedAt: null, deleteNotBefore: null };
}

export function canExecuteDeletion(state: ArchiveState, now = new Date()): boolean {
  return Boolean(state.archivedAt && state.deleteNotBefore && state.deleteNotBefore <= now);
}

export const recoveryWindowDays = 7;
