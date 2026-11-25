/**
 * Z14-46 (D-W14-45): the intake's steps follow the form it is given.
 *
 * At most three questions per step, `N = clamp(ceil(count / 3), 1, 5)` steps,
 * so a form of more than 15 questions spreads evenly over 5 steps. Form order
 * is kept. Fields are spread evenly over the N steps (earlier steps take the
 * extra one), so no step is empty or nearly blank, and the sizes of any two
 * steps differ by at most one. A form with no questions is one empty step.
 */
export const MAX_QUESTIONS_PER_STEP = 3;
export const MAX_STEPS = 5;

export function intakeStepCount(fieldCount: number): number {
  const wanted = Math.ceil(fieldCount / MAX_QUESTIONS_PER_STEP);
  return Math.min(MAX_STEPS, Math.max(1, wanted));
}

export function groupIntakeSteps<T>(fields: readonly T[]): T[][] {
  const steps = intakeStepCount(fields.length);
  const base = Math.floor(fields.length / steps);
  const extra = fields.length % steps;
  const groups: T[][] = [];
  let cursor = 0;
  for (let i = 0; i < steps; i++) {
    const size = base + (i < extra ? 1 : 0);
    groups.push(fields.slice(cursor, cursor + size));
    cursor += size;
  }
  return groups;
}
