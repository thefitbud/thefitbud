import type { RefObject } from "react";
import type {
  ExerciseLibraryItem,
  FoodLibraryItem,
  MealPrescription,
  WorkoutDay,
} from "@fitbud/contracts";
import {
  ExerciseSearchPane,
  FoodSearchPane,
} from "../../pages/templates/LibrarySearch";

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
  const heading = kind === "workout" ? "Exercise library" : "Food library";
  return (
    <aside
      className={overlay ? "library-drawer is-overlay" : "library-drawer"}
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
      <p className="library-note">
        {kind === "workout"
          ? "Reps, load and rest are set in the session, not in the library."
          : "Foods are copied into the plan as snapshots."}
      </p>
      {kind === "workout" ? (
        <ExerciseSearchPane compact day={day} onAdd={onAddExercise} searchRef={searchRef} />
      ) : (
        <FoodSearchPane compact meal={meal} onAdd={onAddFood} searchRef={searchRef} />
      )}
    </aside>
  );
}
