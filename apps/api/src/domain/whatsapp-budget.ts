export type BudgetMode = "normal" | "soft" | "hard";

export function budgetModeForSpend(
  spentPaise: number,
  budgetInr: number,
  hardCapInr: number,
): BudgetMode {
  const budgetPaise = budgetInr * 100;
  const capPaise = hardCapInr * 100;
  if (spentPaise >= capPaise) {
    return "hard";
  }
  if (spentPaise >= budgetPaise) {
    return "soft";
  }
  return "normal";
}

export function messageCostPaise(rateCentipaise: number): number {
  return Math.ceil(rateCentipaise / 100);
}
