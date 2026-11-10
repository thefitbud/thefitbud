/**
 * Set load label → numeric load (Z6-1, master list v13 B1a).
 *
 * Labels such as "40 kg" stay the display source on `set_executions`; this
 * parser derives `prescribed_load_kg`, `actual_load_kg` and `load_kind` from
 * them so strength progress can be charted without parsing free text.
 *
 * It never guesses. A label is a weight only when it states one plainly:
 * - "40 kg", "60kg", "40 KGS", "42.5 kilos", "42,5 kg" → kind `kg`, that number
 * - "90 lb" / "90 lbs" / "90 pounds" → kind `kg`, converted, rounded to 2 decimals (40.82)
 * - "40" → kind `kg` only when the caller passes the exercise's default unit
 *   (`bareNumberUnit`); otherwise `text`
 * - "Bodyweight" / "BW" → kind `bodyweight`, kg null
 * - "BW+10", "BW + 10 kg", "bodyweight + 20 lb" → kind `bodyweight_plus`, kg = the added load
 * - anything else ("RPE 7", "easy", "2x20 kg", "40-50 kg", "40, 45 kg", "BW-10") → kind `text`, kg null
 *
 * The numeric part is 1–4 digits with at most 2 decimals. A single comma
 * followed by one or two digits is a decimal comma ("42,5"); any other comma
 * makes the label `text`.
 *
 * Migration `0035_numeric_set_load.sql` backfills existing rows with the same
 * rules in SQL. Every step below has a SQL twin there, and
 * `migration-chain.test.ts` checks both agree on the labels of
 * `load-parser.test.ts` (its LOAD_LABELS list). Change both together.
 */

export const LOAD_KINDS = ["kg", "bodyweight", "bodyweight_plus", "text"] as const;
export type LoadKind = (typeof LOAD_KINDS)[number];

export type ParsedLoad = {
  kind: LoadKind;
  /** Load in kg (the added load for `bodyweight_plus`); null for `bodyweight` and `text`. */
  kg: number | null;
};

export type LoadUnit = "kg" | "lb";

export type ParseLoadOptions = {
  /**
   * The exercise's default load unit. A bare number ("40") is read in this
   * unit; without it a bare number is `text`. "BW+10" always reads kg.
   */
  bareNumberUnit?: LoadUnit;
};

const TEXT: ParsedLoad = { kind: "text", kg: null };

/** Longest first is not needed: no suffix ends with another. Order mirrors the SQL CASE. */
const UNIT_SUFFIXES: ReadonlyArray<readonly [string, LoadUnit]> = [
  ["kilograms", "kg"],
  ["kilogram", "kg"],
  ["kilos", "kg"],
  ["kilo", "kg"],
  ["kgs", "kg"],
  ["kg", "kg"],
  ["pounds", "lb"],
  ["pound", "lb"],
  ["lbs", "lb"],
  ["lb", "lb"],
];

const KG_PER_LB = 0.45359237;

/**
 * Lower-cases, turns tabs and line breaks into spaces and trims spaces. ASCII
 * only, like SQLite's lower() and trim(X, ' '), so the backfill matches.
 */
function normalize(label: string): string {
  return label
    .replace(/[\t\n\r]/g, " ")
    .replace(/[A-Z]/g, (c) => c.toLowerCase())
    .replace(/^ +| +$/g, "");
}

/** True when a label is missing or only spaces, tabs and line breaks. */
export function isBlankLoadLabel(label: string | null | undefined): boolean {
  return label == null || normalize(label) === "";
}

/** "40" → 4000, "40.5" → 4050, "40.25" → 4025: hundredths as an exact integer. */
function hundredths(num: string): number | null {
  const match = /^([0-9]{1,4})(?:\.([0-9]{1,2}))?$/.exec(num);
  if (!match) return null;
  const decimals = (match[2] ?? "").padEnd(2, "0");
  return Number.parseInt(match[1]! + decimals, 10);
}

function quantityKg(quantity: string, defaultUnit: LoadUnit | undefined): number | null {
  let num = quantity;
  let unit: LoadUnit | undefined;
  for (const [suffix, suffixUnit] of UNIT_SUFFIXES) {
    if (quantity.endsWith(suffix)) {
      num = quantity.slice(0, quantity.length - suffix.length);
      unit = suffixUnit;
      break;
    }
  }
  unit ??= defaultUnit;
  if (!unit) return null;
  const h = hundredths(num);
  if (h == null) return null;
  // Integer arithmetic plus one IEEE multiply, so SQL (CAST … AS INTEGER) gives the same double.
  return unit === "kg" ? h / 100 : Math.floor(h * KG_PER_LB + 0.5) / 100;
}

export function parseLoadLabel(
  label: string | null | undefined,
  options: ParseLoadOptions = {},
): ParsedLoad {
  if (label == null) return TEXT;
  let s = normalize(label);
  if (s === "") return TEXT;

  if (s.includes(",")) {
    const oneComma = s.indexOf(",") === s.lastIndexOf(",");
    if (!oneComma || s.includes(".") || !/[0-9],[0-9]{1,2}(?:[^0-9]|$)/.test(s)) {
      return TEXT;
    }
    s = s.replace(",", ".");
  }

  // "4 0 kg", "40 .5 kg": numbers split by any run of spaces are never read
  // as one number (D-W8-14). Checked on the whole run, so a long gap cannot
  // slip past the way it did with the old three-pass collapse (Z7-28 pin).
  if (/[0-9.] +[0-9.]/.test(s)) return TEXT;
  s = s.replaceAll(" ", "");

  if (s === "bw" || s === "bodyweight") return { kind: "bodyweight", kg: null };

  if (s.startsWith("bw+") || s.startsWith("bodyweight+")) {
    const kg = quantityKg(s.slice(s.indexOf("+") + 1), "kg");
    return kg == null ? TEXT : { kind: "bodyweight_plus", kg };
  }

  const kg = quantityKg(s, options.bareNumberUnit);
  return kg == null ? TEXT : { kind: "kg", kg };
}

export type SetLoadColumns = {
  prescribedLoadKg: number | null;
  actualLoadKg: number | null;
  loadKind: LoadKind;
};

/**
 * The three numeric columns for one set. Each kg comes from its own label;
 * the kind describes the load the set carries now: the actual label once one
 * is logged, else the prescribed label.
 */
export function resolveSetLoad(
  labels: {
    prescribedLoadLabel: string | null | undefined;
    actualLoadLabel: string | null | undefined;
  },
  options: ParseLoadOptions = {},
): SetLoadColumns {
  const prescribed = parseLoadLabel(labels.prescribedLoadLabel, options);
  const actual = parseLoadLabel(labels.actualLoadLabel, options);
  return {
    prescribedLoadKg: prescribed.kg,
    actualLoadKg: actual.kg,
    loadKind: isBlankLoadLabel(labels.actualLoadLabel) ? prescribed.kind : actual.kind,
  };
}
