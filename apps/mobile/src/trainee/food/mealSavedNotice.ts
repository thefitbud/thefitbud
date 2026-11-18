import { useSyncExternalStore } from "react";

/**
 * TR-26f: "{Meal} saved · {kcal} kcal" with View, shown on Diet after a log
 * made on another screen (food search, create a food, ate out). The screen
 * that saved closes straight after, so the notice waits here until Diet takes
 * it; one left untaken (the trainee went elsewhere) expires rather than
 * popping up later out of context.
 */
export type MealSavedNotice = {
  id: number;
  relationshipId: string;
  assignmentId: string;
  localDate: string;
  mealName: string;
  /**
   * Kcal as saved on this phone (null: not known, a note-only ate out); the
   * row and ring read the server's figure.
   */
  kcal: number | null;
  kind: "logged_foods" | "restaurant" | "portion_adjustment";
  at: number;
};

/** A notice Diet has not taken within this long is dropped. */
export const MEAL_SAVED_NOTICE_TTL_MS = 15_000;

let current: MealSavedNotice | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function announceMealSaved(
  input: Omit<MealSavedNotice, "id" | "at">,
  now = Date.now(),
): void {
  current = { ...input, id: nextId++, at: now };
  emit();
}

/** The waiting notice for this relationship, or null (expired ones are dropped). */
export function peekMealSaved(
  relationshipId: string,
  now = Date.now(),
): MealSavedNotice | null {
  if (!current) return null;
  if (now - current.at > MEAL_SAVED_NOTICE_TTL_MS) {
    current = null;
    return null;
  }
  return current.relationshipId === relationshipId ? current : null;
}

/** Diet took the notice (shown, or dismissed): it never shows twice. */
export function takeMealSaved(id: number): void {
  if (current?.id !== id) return;
  current = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): MealSavedNotice | null {
  return current;
}

/** The waiting notice for this relationship, live. */
export function useMealSavedNotice(relationshipId: string): MealSavedNotice | null {
  const value = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (!value || value.relationshipId !== relationshipId) return null;
  return peekMealSaved(relationshipId);
}

/** Test hook: forget any waiting notice. */
export function resetMealSavedNotice(): void {
  current = null;
  emit();
}
