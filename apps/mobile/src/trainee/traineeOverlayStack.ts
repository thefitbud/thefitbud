/**
 * Trainee overlay back stack (Z14-25, D-W14-24).
 *
 * The trainee shell shows screens opened over a tab (Account, Password, a
 * meal, a workout overview...) as a stack. Opening one from a tab or from
 * another screen pushes it; Back pops, so it lands on the screen that opened
 * it, or on the tab when nothing is below. A flow that really ends (coaching
 * resumed, a deep link, a notification, sign-out) resets the stack.
 *
 * Pure functions over a readonly array, same shape as the trainer's
 * `overlayStack.ts`. Generic so the stack knows nothing about screens.
 */

/** Same value as the top screen: a double tap must not stack it twice. */
function sameAsTop<T>(stack: readonly T[], next: T): boolean {
  const top = stack[stack.length - 1];
  return top !== undefined && JSON.stringify(top) === JSON.stringify(next);
}

/** Open a screen over the current top. Ignored when it is already the top. */
export function pushOverlay<T>(stack: readonly T[], next: T): T[] {
  if (sameAsTop(stack, next)) return stack as T[];
  return [...stack, next];
}

/** Back: drop the top. An empty stack stays empty (the tab shows). */
export function popOverlay<T>(stack: readonly T[]): T[] {
  return stack.length === 0 ? (stack as T[]) : stack.slice(0, -1);
}

/** Swap the top for another screen (no new level). On an empty stack it pushes. */
export function replaceOverlay<T>(stack: readonly T[], next: T): T[] {
  if (stack.length === 0) return [next];
  return [...stack.slice(0, -1), next];
}

/** Start again: just `next` (a push or deep link has nothing below), or nothing. */
export function resetOverlays<T>(next?: T): T[] {
  return next === undefined ? [] : [next];
}
