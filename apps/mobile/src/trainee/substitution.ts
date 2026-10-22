/**
 * Something different: the first substitute food replaces the planned meal
 * (clear prefills). Further adds append to the substituted list.
 */
export function nextLoggedRowsForSubstitution<T>(input: {
  previous: T[];
  next: T;
  alreadyReplaced: boolean;
}): T[] {
  if (input.alreadyReplaced) return [...input.previous, input.next];
  return [input.next];
}
