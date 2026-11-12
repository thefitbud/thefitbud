/**
 * Trainer detail-screen back stack.
 *
 * The trainer shell shows one detail screen (an "overlay") over the tab the
 * trainer was on. Opening a detail screen from another detail screen (client
 * page -> check-in review, check-in review -> client page) pushes; Back pops,
 * so it lands on the screen that opened it. With nothing below, Back leaves
 * the overlays and shows the tab the trainer started from.
 *
 * A check-in opened cold (a push or deep link) has nothing below it. If its
 * client is known, Back goes to the client's page instead of the tab list.
 */
export type OverlayKind = "exception" | "client" | "checkin" | "notifications" | "profile";

export type OverlayBase = { kind: OverlayKind };

/** Opening a screen from another detail screen pushes it on top of the stack. */
export function pushOverlay<T extends OverlayBase>(stack: readonly T[], next: T): T[] {
  return [...stack, next];
}

/** Opening from a tab, a push or a deep link starts a fresh stack: no previous screen. */
export function startOverlays<T extends OverlayBase>(next: T): T[] {
  return [next];
}

export type BackResult<T> =
  | { kind: "stack"; stack: T[] }
  | { kind: "client"; relationshipId: string };

/**
 * Back. With a screen below, pop to it. A cold check-in (no screen below, opened
 * from a push or link) goes to its client's page when the client is known.
 * Otherwise every overlay closes and the tab the trainer was on shows.
 */
export function backOverlays<T extends OverlayBase & { cold?: boolean }>(
  stack: readonly T[],
  resolvedRelationshipId?: string,
): BackResult<T> {
  if (stack.length > 1) return { kind: "stack", stack: stack.slice(0, -1) };
  const top = stack[0];
  if (top?.kind === "checkin" && top.cold) {
    // A cold check-in has no relationship id of its own; the review screen
    // reports the one it read from the fetched check-in.
    if (resolvedRelationshipId) {
      return { kind: "client", relationshipId: resolvedRelationshipId };
    }
  }
  return { kind: "stack", stack: [] };
}
