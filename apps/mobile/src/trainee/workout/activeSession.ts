/**
 * The workout that is open right now (Z12-45).
 *
 * It lives outside any screen so that minimising the log (W-14) keeps it: the
 * Workout tab shows the log again from here, and the minimised bar above the
 * tab bar reads the same session on every tab. Nothing here is a second
 * source of truth for coaching state: the execution is the snapshot the log
 * already held in component state, and the server and the outbox stay
 * authoritative. A relaunch starts empty and the session comes back from the
 * server's open execution (W-18).
 *
 * A session belongs to one coaching relationship. Readers pass theirs, so a
 * session left behind by another account on this phone is never shown.
 */
import { useSyncExternalStore } from "react";
import type { WorkoutAssignment, WorkoutExecution } from "@fitbud/contracts";
import type { RestWindow } from "../../notifications/liveActivity";

export type ActiveSession = {
  relationshipId: string;
  execution: WorkoutExecution;
  assignment: WorkoutAssignment | null;
  /** True while the log is tucked into the bar above the tab bar. */
  minimised: boolean;
  /** The running rest, so it survives minimise and restore. */
  rest: RestWindow | null;
};

let current: ActiveSession | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getActiveSession(relationshipId: string): ActiveSession | null {
  return current && current.relationshipId === relationshipId ? current : null;
}

/** Open a session, replacing any other. */
export function openActiveSession(input: {
  relationshipId: string;
  execution: WorkoutExecution;
  assignment: WorkoutAssignment | null;
}): void {
  current = { ...input, minimised: false, rest: null };
  emit();
}

/** Change the open session of `relationshipId`; a no-op when there is none. */
export function updateActiveSession(
  relationshipId: string,
  patch: Partial<Omit<ActiveSession, "relationshipId">>,
): void {
  if (!current || current.relationshipId !== relationshipId) return;
  current = { ...current, ...patch };
  emit();
}

/** Close the session (finished, discarded, or left). */
export function closeActiveSession(relationshipId?: string): void {
  if (!current) return;
  if (relationshipId != null && current.relationshipId !== relationshipId) return;
  current = null;
  emit();
}

/** The open session of this relationship, live. */
export function useActiveSession(relationshipId: string | null): ActiveSession | null {
  const read = () =>
    relationshipId != null ? getActiveSession(relationshipId) : null;
  return useSyncExternalStore(subscribe, read, read);
}
