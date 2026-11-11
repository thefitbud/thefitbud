/**
 * Set entry maths for the active workout keypad (Z9-7, frames 11 / 11c).
 * Pure functions: the screen owns the state, these own the rules.
 */

export type KeypadField = "load" | "reps";

/** What the trainee has typed for the current set. `load` is kg as typed ("" = untouched). */
export type SetDraft = { load: string; reps: string; bodyweight: boolean };

export const LOAD_STEP_KG = 2.5;
export const REPS_STEP = 1;
export const MAX_LOAD_KG = 500;
export const MAX_REPS = 100;

const BODYWEIGHT_LABEL = /^\s*(body\s*weight|bw)\s*$/i;
const PLAIN_KG_LABEL = /^\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:kg|kgs)?\s*$/i;

/** A missing label means no load was prescribed: the set is bodyweight. */
export function isBodyweightLabel(label: string | null | undefined): boolean {
  const raw = label?.trim() ?? "";
  return raw === "" || BODYWEIGHT_LABEL.test(raw);
}

/** "22.5 kg" → "22.5". Anything that is not one plain weight ("BW+10", "RPE 7") → "". */
export function plainKgFromLabel(label: string | null | undefined): string {
  const match = (label ?? "").match(PLAIN_KG_LABEL);
  return match ? match[1]!.replace(",", ".") : "";
}

export function initialDraft(
  prescribedLoadLabel: string | null | undefined,
  prescribedReps: number | null | undefined,
): SetDraft {
  return {
    load: plainKgFromLabel(prescribedLoadLabel),
    reps: prescribedReps != null ? String(prescribedReps) : "",
    bodyweight: isBodyweightLabel(prescribedLoadLabel),
  };
}

export function formatKg(kg: number): string {
  return String(Math.round(kg * 100) / 100);
}

/** One keypad key (a digit or ".") appended to the typed text. */
export function pressKey(
  current: string,
  key: string,
  field: KeypadField,
  replace: boolean,
): string {
  const base = replace ? "" : current;
  if (field === "reps") {
    if (!/^\d$/.test(key)) return current;
    const next = base === "0" ? key : base + key;
    if (next === "0") return current;
    return Number(next) > MAX_REPS ? current : next;
  }
  if (key === ".") {
    if (base.includes(".")) return current;
    return base === "" ? "0." : base + ".";
  }
  if (!/^\d$/.test(key)) return current;
  const next = base === "0" ? key : base + key;
  const [, decimals] = next.split(".");
  if (decimals != null && decimals.length > 2) return current;
  return Number(next) > MAX_LOAD_KG ? current : next;
}

export function backspace(current: string, replace: boolean): string {
  if (replace) return "";
  return current.slice(0, -1);
}

/** ±2.5 on load, ±1 on reps, kept inside the allowed range. */
export function stepValue(
  current: string,
  direction: 1 | -1,
  field: KeypadField,
): string {
  const n = Number.parseFloat(current);
  const from = Number.isFinite(n) ? n : 0;
  if (field === "reps") {
    const next = Math.min(MAX_REPS, Math.max(1, from + direction * REPS_STEP));
    return String(Math.round(next));
  }
  const next = Math.min(
    MAX_LOAD_KG,
    Math.max(0, from + direction * LOAD_STEP_KG),
  );
  return formatKg(next);
}

export type SetLoadBody = {
  actualLoadKg?: number;
  actualLoadLabel?: string | null;
};

/**
 * The load part of the complete-set body. Bodyweight sends the label
 * "Bodyweight" (the API reads it as bodyweight, kg null). A typed weight sends
 * the number, which wins over any label. Nothing typed and nothing prescribed
 * as a plain weight sends nothing, so the prescribed load stands.
 */
export function loadBody(
  draft: SetDraft,
  prescribedLoadLabel?: string | null,
): SetLoadBody {
  // Untouched: the prescription stands (a bare "40" included).
  const initial = initialDraft(prescribedLoadLabel, null);
  if (
    draft.bodyweight === initial.bodyweight &&
    (draft.bodyweight || draft.load === initial.load)
  ) {
    return { actualLoadLabel: null };
  }
  if (draft.bodyweight) {
    // Bodyweight as prescribed is not a change: keep the prescribed load.
    return isBodyweightLabel(prescribedLoadLabel)
      ? { actualLoadLabel: null }
      : { actualLoadLabel: "Bodyweight" };
  }
  const kg = Number.parseFloat(draft.load);
  if (draft.load.trim() !== "" && Number.isFinite(kg)) {
    return { actualLoadKg: Math.round(kg * 100) / 100 };
  }
  return { actualLoadLabel: null };
}

/** How a prescribed load reads: "bodyweight", "40 kg", or the raw label ("RPE 7", "90 lb"). */
export function prescribedLoadText(label: string | null | undefined): string {
  if (isBodyweightLabel(label)) return "bodyweight";
  const kg = plainKgFromLabel(label);
  return kg !== "" ? `${kg} kg` : (label ?? "").trim();
}

/** The label the screen shows for the set once it is logged locally. */
export function loadLabelForDraft(
  draft: SetDraft,
  prescribedLoadLabel?: string | null,
): string | null {
  const body = loadBody(draft, prescribedLoadLabel);
  if (body.actualLoadKg !== undefined) return `${formatKg(body.actualLoadKg)} kg`;
  return body.actualLoadLabel ?? null;
}

/** The prescription a set row starts from. Structural, so any set shape fits. */
export type SetPlan = {
  prescribedLoadLabel?: string | null;
  prescribedReps?: number | null;
};

/** "BW", a plain kg number, or the raw label ("RPE 7"). */
export function displayLoad(label: string | null | undefined): string {
  const raw = label?.trim() ?? "";
  if (isBodyweightLabel(raw)) return "BW";
  const kg = plainKgFromLabel(raw);
  return kg !== "" ? kg : raw;
}

export function draftForSet(
  set: SetPlan & { id: string },
  drafts: Record<string, SetDraft>,
): SetDraft {
  return drafts[set.id] ?? initialDraft(set.prescribedLoadLabel, set.prescribedReps);
}

export function isDraftModified(set: SetPlan, draft: SetDraft): boolean {
  const reps =
    draft.reps.trim() === ""
      ? null
      : Number.parseInt(draft.reps.trim(), 10);
  const repsChanged =
    reps != null &&
    Number.isFinite(reps) &&
    set.prescribedReps != null &&
    reps !== set.prescribedReps;
  const initial = initialDraft(set.prescribedLoadLabel, set.prescribedReps);
  const loadChanged =
    draft.bodyweight !== initial.bodyweight ||
    (!draft.bodyweight &&
      draft.load.trim() !== "" &&
      Number.parseFloat(draft.load) !== Number.parseFloat(initial.load));
  return repsChanged || loadChanged;
}

/** True when the load cell shows a kg number (so it carries the "kg" unit). */
export function loadCellIsKg(draft: SetDraft): boolean {
  return !draft.bodyweight && draft.load.trim() !== "";
}

/** What the load cell of the row being edited shows. */
export function loadCellText(set: SetPlan, draft: SetDraft): string {
  if (draft.bodyweight) return "Bodyweight";
  if (draft.load.trim() !== "") return draft.load;
  // Switched to kg on a bodyweight set: nothing typed yet.
  if (isBodyweightLabel(set.prescribedLoadLabel)) return "—";
  return displayLoad(set.prescribedLoadLabel);
}
