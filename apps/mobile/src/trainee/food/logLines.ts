import type {
  LoggedFoodItem,
  TraineeFoodDetail,
  TraineeFoodSearchResponse,
} from "@fitbud/contracts";
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import type { PlannedRow } from "../../lib/plannedMealItems";
import { cleanFoodLabel } from "../mealHelpers";

export type FoodSearchItem = TraineeFoodSearchResponse["items"][number];

export type Macros = { protein: number; carbs: number; fat: number };

/**
 * One line of the log being built on TR-26b. `quantity` counts `unitLabel`s
 * (or grams when `grams` is set); kcal and macros are for one of them.
 */
export type LogLine = {
  key: string;
  name: string;
  quantity: number;
  unitLabel: string;
  /**
   * Grams mode (TR-26c "Grams"): `quantity` is grams, kcal and macros are per
   * gram, and the request sends grams ÷ `perServing` of the gram serving.
   */
  grams?: { perServing: number };
  kcalPerUnit: number | null;
  macrosPerUnit: Macros | null;
  /** A library food (`foodId`) or a food logged by name (`customFood`). */
  source:
    | { kind: "library"; foodId: string; servingId?: string }
    | {
        kind: "custom";
        /** D-W12-24: only a newly created food is saved to "my foods". */
        saveToMyFoods: boolean;
      };
  /** False until the food's real servings are known (fetched in the background). */
  servingKnown: boolean;
  /** The trainee changed the amount by hand: background data never overrides it. */
  touched: boolean;
};

const FRACTIONS: Array<[number, string]> = [
  [0.25, "¼"],
  [0.5, "½"],
  [0.75, "¾"],
];

/** "1½", "½", "2", "0.4" — the kit's amount style (TR-08b, TR-26c). */
export function formatAmount(value: number): string {
  const whole = Math.floor(value + 1e-9);
  const rest = value - whole;
  if (rest < 1e-6) return String(whole);
  const glyph = FRACTIONS.find(([f]) => Math.abs(rest - f) < 1e-6)?.[1];
  if (glyph) return whole > 0 ? `${whole}${glyph}` : glyph;
  return String(Math.round(value * 100) / 100);
}

function unscale(scaled: number | null | undefined): number | null {
  return scaled == null ? null : scaled / NUTRIENT_SCALE;
}

/** The search item's default serving, as shown on the row ("1 medium chapati (40 g) · 81 kcal"). */
export function searchItemServing(item: FoodSearchItem): {
  label: string;
  kcal: number | null;
  macros: Macros | null;
} {
  const serving = item.serving ?? null;
  if (!serving) {
    return { label: "1 serving", kcal: null, macros: null };
  }
  const protein = unscale(serving.proteinScaled);
  const carbs = unscale(serving.carbsScaled);
  const fat = unscale(serving.fatScaled);
  const kcal = unscale(serving.kcalScaled);
  return {
    label: cleanFoodLabel(serving.label),
    kcal: kcal == null ? null : Math.round(kcal),
    macros:
      protein == null && carbs == null && fat == null
        ? null
        : { protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 },
  };
}

export function foodKey(item: FoodSearchItem): string {
  return `${item.source === "custom" ? "custom" : "food"}:${item.id}`;
}

/** A new line for a search or Recent hit, from what the hit already carries. */
export function lineFromSearchItem(item: FoodSearchItem): LogLine {
  const serving = searchItemServing(item);
  const custom = item.source === "custom";
  return {
    key: foodKey(item),
    name: cleanFoodLabel(item.name),
    quantity: 1,
    unitLabel: serving.label,
    kcalPerUnit: serving.kcal,
    macrosPerUnit: serving.macros,
    source: custom
      ? { kind: "custom", saveToMyFoods: false }
      : {
          kind: "library",
          foodId: item.id,
          servingId: item.defaultServingId ?? undefined,
        },
    // A trainee's own food has one serving; a library hit without one still
    // needs its detail.
    servingKnown: custom || item.serving != null,
    touched: false,
  };
}

/** A line for a food from the meal's plan ("From your plan"). */
export function lineFromPlanRow(row: PlannedRow, index: number): LogLine {
  const kcalPerUnit =
    row.kcalPreview != null && row.quantity > 0 ? row.kcalPreview / row.quantity : null;
  return {
    key: row.foodId ? `food:${row.foodId}` : `plan:${index}`,
    name: cleanFoodLabel(row.label),
    quantity: row.quantity,
    unitLabel: row.unitLabel || "serving",
    kcalPerUnit,
    macrosPerUnit: null,
    source: row.foodId
      ? { kind: "library", foodId: row.foodId, servingId: row.servingId }
      : { kind: "custom", saveToMyFoods: false },
    servingKnown: true,
    touched: false,
  };
}

/** The line for a food created on TR-26e. Its kcal and macros are for the whole amount. */
export function lineFromCustomFood(input: {
  key: string;
  name: string;
  amount: number;
  unit: string;
  kcal: number;
  macros: Partial<Macros>;
  saveToMyFoods: boolean;
}): LogLine {
  return {
    key: input.key,
    name: input.name.trim(),
    quantity: 1,
    unitLabel: `${formatAmount(input.amount)} ${input.unit}`.trim(),
    kcalPerUnit: input.kcal,
    macrosPerUnit: {
      protein: input.macros.protein ?? 0,
      carbs: input.macros.carbs ?? 0,
      fat: input.macros.fat ?? 0,
    },
    source: { kind: "custom", saveToMyFoods: input.saveToMyFoods },
    servingKnown: true,
    touched: false,
  };
}

/**
 * Fills in a library line's real default serving once the detail arrives,
 * unless the trainee already set the amount themselves.
 */
export function withServingFromDetail(
  line: LogLine,
  detail: TraineeFoodDetail,
): LogLine {
  if (line.touched || line.servingKnown || line.source.kind !== "library") {
    return line;
  }
  const serving =
    detail.servings.find((s) => s.id === detail.defaultServingId) ??
    detail.servings[0];
  if (!serving) return { ...line, servingKnown: true };
  const per = perServingFromDetail(detail, serving.conversionScaled);
  return {
    ...line,
    unitLabel: cleanFoodLabel(serving.label),
    kcalPerUnit: per.kcal,
    macrosPerUnit: per.macros,
    source: { ...line.source, servingId: serving.id },
    servingKnown: true,
  };
}

/** One serving's kcal and macros from a per-100 g (or ml) food detail. */
export function perServingFromDetail(
  detail: TraineeFoodDetail,
  conversionScaled: number | null,
): { kcal: number | null; macros: Macros | null } {
  const factor = (conversionScaled ?? 100 * NUTRIENT_SCALE) / (100 * NUTRIENT_SCALE);
  const of = (scaled: number | null) =>
    scaled == null ? null : (scaled / NUTRIENT_SCALE) * factor;
  const kcal = of(detail.energyKcalScaled);
  const protein = of(detail.proteinScaled);
  const carbs = of(detail.carbsScaled);
  const fat = of(detail.fatScaled);
  return {
    kcal: kcal == null ? null : kcal,
    macros:
      protein == null && carbs == null && fat == null
        ? null
        : { protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 },
  };
}

export function lineKcal(line: LogLine): number | null {
  return line.kcalPerUnit == null ? null : Math.round(line.kcalPerUnit * line.quantity);
}

/** The tray chip: "Chapati / roti × 2", "Rice · 150 g", "Masala chai". */
export function lineChipLabel(line: LogLine): string {
  if (line.grams) return `${line.name} · ${formatAmount(line.quantity)} g`;
  return line.quantity === 1 ? line.name : `${line.name} × ${formatAmount(line.quantity)}`;
}

/** A just-added line's toast copy: "Added Chapati / roti · 1 piece". */
export function lineAddedLabel(line: LogLine): string {
  const amount = line.grams
    ? `${formatAmount(line.quantity)} g`
    : line.quantity === 1
      ? line.unitLabel
      : `${formatAmount(line.quantity)} × ${line.unitLabel}`;
  return `Added ${line.name} · ${amount}`;
}

export function logTotals(lines: readonly LogLine[]): {
  kcal: number;
  unknown: boolean;
  macros: Macros;
} {
  let kcal = 0;
  let unknown = false;
  const macros: Macros = { protein: 0, carbs: 0, fat: 0 };
  for (const line of lines) {
    if (line.kcalPerUnit == null) unknown = true;
    else kcal += line.kcalPerUnit * line.quantity;
    if (line.macrosPerUnit) {
      macros.protein += line.macrosPerUnit.protein * line.quantity;
      macros.carbs += line.macrosPerUnit.carbs * line.quantity;
      macros.fat += line.macrosPerUnit.fat * line.quantity;
    }
  }
  return {
    kcal: Math.round(kcal),
    unknown,
    macros: {
      protein: Math.round(macros.protein),
      carbs: Math.round(macros.carbs),
      fat: Math.round(macros.fat),
    },
  };
}

function oneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The deviate request item for a line (D-W12-24 for custom foods). */
export function toLoggedItem(line: LogLine): LoggedFoodItem {
  if (line.source.kind === "library") {
    return {
      foodId: line.source.foodId,
      servingId: line.source.servingId,
      quantity: line.grams ? line.quantity / line.grams.perServing : line.quantity,
    };
  }
  const servingLabel =
    line.quantity === 1
      ? line.unitLabel
      : `${formatAmount(line.quantity)} × ${line.unitLabel}`;
  const macros = line.macrosPerUnit;
  return {
    customFood: {
      name: line.name.slice(0, 120),
      kcal: Math.max(0, Math.round((line.kcalPerUnit ?? 0) * line.quantity)),
      ...(macros
        ? {
            protein: oneDecimal(macros.protein * line.quantity),
            carbs: oneDecimal(macros.carbs * line.quantity),
            fat: oneDecimal(macros.fat * line.quantity),
          }
        : {}),
      servingLabel: servingLabel.slice(0, 120),
    },
    saveToMyFoods: line.source.saveToMyFoods,
  };
}

/** Taps on the same food closer than this are one tap (TR-26b: a double tap adds one). */
export const ADD_DEBOUNCE_MS = 450;

/**
 * Adds a line or, for a food already in the log, one more of it. A repeat
 * within `ADD_DEBOUNCE_MS` of the last add of that food is ignored, so a
 * double tap adds it once. Returns the next lines and whether anything changed.
 */
export function addLine(
  lines: readonly LogLine[],
  next: LogLine,
  lastAddAt: Map<string, number>,
  now: number,
): { lines: LogLine[]; added: boolean } {
  const last = lastAddAt.get(next.key);
  if (last != null && now - last < ADD_DEBOUNCE_MS) {
    return { lines: [...lines], added: false };
  }
  lastAddAt.set(next.key, now);
  const index = lines.findIndex((line) => line.key === next.key);
  if (index === -1) return { lines: [...lines, next], added: true };
  const existing = lines[index]!;
  const step = existing.grams ? 50 : 1;
  const updated = { ...existing, quantity: existing.quantity + step, touched: true };
  return {
    lines: lines.map((line, i) => (i === index ? updated : line)),
    added: true,
  };
}
