export type MacroLine = {
  kcalScaled: number;
  proteinScaled: number;
  carbsScaled: number;
  fatScaled: number;
};

export function scaleMacro(value: number, quantity: number, basis = 1): number {
  if (!Number.isFinite(value) || !Number.isFinite(quantity)) {
    return 0;
  }
  return Math.round((value * quantity * 100) / basis);
}

export function sumMacros(lines: MacroLine[]): MacroLine {
  return lines.reduce(
    (acc, line) => ({
      kcalScaled: acc.kcalScaled + line.kcalScaled,
      proteinScaled: acc.proteinScaled + line.proteinScaled,
      carbsScaled: acc.carbsScaled + line.carbsScaled,
      fatScaled: acc.fatScaled + line.fatScaled,
    }),
    { kcalScaled: 0, proteinScaled: 0, carbsScaled: 0, fatScaled: 0 },
  );
}
