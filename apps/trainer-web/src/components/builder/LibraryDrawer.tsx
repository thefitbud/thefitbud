import type { RefObject } from "react";
import type {
  ExerciseLibraryItem,
  FoodLibraryItem,
  MealPrescription,
  WorkoutDay,
} from "@fitbud/contracts";
import {
  BuilderExerciseLibrary,
  BuilderFoodLibrary,
} from "./BuilderLibraryList";

export function LibraryDrawer({
  kind,
  day,
  meal,
  onAddExercise,
  onAddFood,
  searchRef,
  overlay = false,
  open = true,
  onClose,
}: {
  kind: "workout" | "nutrition";
  day: WorkoutDay | null;
  meal: MealPrescription | null;
  onAddExercise: (item: ExerciseLibraryItem) => void;
  onAddFood: (item: FoodLibraryItem, servingId: string) => void;
  searchRef: RefObject<HTMLInputElement>;
  overlay?: boolean;
  open?: boolean;
  onClose?: () => void;
}) {
  if (overlay && !open) return null;
  const heading = kind === "workout" ? "Exercises" : "Foods";
  return (
    <aside
      className={
        overlay
          ? "library-drawer builder-library is-overlay"
          : "library-drawer builder-library"
      }
      aria-label={heading}
      data-testid="library-drawer"
    >
      <header className="library-drawer-head">
        <h2 className="builder-pane-title">{heading}</h2>
        {overlay ? (
          <button type="button" className="button-ghost button-sm" onClick={onClose}>
            Close
          </button>
        ) : null}
      </header>
      {kind === "workout" ? (
        <BuilderExerciseLibrary day={day} onAdd={onAddExercise} searchRef={searchRef} />
      ) : (
        <BuilderFoodLibrary meal={meal} onAdd={onAddFood} searchRef={searchRef} />
      )}
    </aside>
  );
}
