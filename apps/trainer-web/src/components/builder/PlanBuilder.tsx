import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type {
  ExerciseLibraryItem,
  FoodLibraryItem,
  PlanContent,
} from "@fitbud/contracts";
import { formatClockTime, formatHhMmTime } from "@fitbud/core";
import {
  addExerciseFromLibrary,
  addFoodItemFromLibrary,
  addSetTarget,
  sortedByOrder,
} from "../plan-composition";
import { BuilderLayout, useBuilderMode } from "./BuilderLayout";
import { DaysPane } from "./DaysPane";
import { LibraryDrawer } from "./LibraryDrawer";
import { MealDaysPane, MealsPane, type MealDay } from "./MealsPane";
import { PhonePreview } from "./PhonePreview";
import { SessionEditor } from "./SessionEditor";
import { publishIssues, type PublishIssues } from "./validation";
import { useBuilderDraft, type SaveState } from "./useBuilderDraft";
import { WEEK_ORDER, weekdayShort } from "./weekdays";

export type BuilderTab = "workout" | "nutrition";

export type BuilderExpectations = {
  sessionsPerWeek: number;
  mealsPerDay: number;
  photoRequirement: "none" | "selected_meals" | "all_meals" | null;
};

function statusText(state: SaveState): string {
  switch (state.kind) {
    case "saving":
      return "Saving…";
    case "dirty":
      return "Unsaved changes";
    case "invalid":
      return `Not saved · ${state.message}`;
    case "error":
      return "Couldn't save";
    case "conflict":
      return "Not saved";
    case "saved":
      return state.at ? `Saved ${formatClockTime(state.at)}` : "Saved";
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

function ReadOnlySummary({ content }: { content: PlanContent }) {
  const sessions = [...content.workoutDays].sort(
    (a, b) =>
      WEEK_ORDER.indexOf((a.weekday ?? 9) as (typeof WEEK_ORDER)[number]) -
      WEEK_ORDER.indexOf((b.weekday ?? 9) as (typeof WEEK_ORDER)[number]),
  );
  return (
    <div className="builder-readonly">
      {sessions.length > 0 ? (
        <section>
          <h3>Sessions</h3>
          <ul>
            {sessions.map((day) => (
              <li key={day.id}>
                <strong>{day.weekday != null ? weekdayShort(day.weekday) : "Unscheduled"}</strong>{" "}
                {day.name} · {day.exercises.length}{" "}
                {day.exercises.length === 1 ? "exercise" : "exercises"}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {content.mealPrescriptions.length > 0 ? (
        <section>
          <h3>Meals</h3>
          <ul>
            {sortedByOrder(content.mealPrescriptions).map((meal) => (
              <li key={meal.id}>
                <strong>{meal.name}</strong>
                {meal.localTime ? ` · ${formatHhMmTime(meal.localTime)}` : ""} ·{" "}
                {(meal.items ?? []).length} {(meal.items ?? []).length === 1 ? "food" : "foods"}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function PlanBuilder({
  backTo,
  backLabel,
  initialTitle,
  initialContent,
  statusLabel,
  tab,
  onTabChange,
  save,
  readOnly = false,
  readOnlyNote,
  online,
  clientName,
  expectations = null,
  loadPreview,
  onPublish,
  publishLabel = "Publish…",
  banner,
  screenId,
}: {
  backTo: string;
  backLabel: string;
  initialTitle: string;
  initialContent: PlanContent;
  statusLabel: string;
  tab: BuilderTab;
  onTabChange?: (tab: BuilderTab) => void;
  save: (title: string, content: PlanContent) => Promise<void>;
  readOnly?: boolean;
  readOnlyNote?: ReactNode;
  online: boolean;
  clientName?: string;
  expectations?: BuilderExpectations | null;
  loadPreview?: () => Promise<PlanContent>;
  onPublish?: (args: { title: string; content: PlanContent; issues: PublishIssues }) => void;
  publishLabel?: string;
  banner?: ReactNode;
  screenId: string;
}) {
  const mode = useBuilderMode();
  const [title, setTitle] = useState(initialTitle);
  const { content, setContent, undo, canUndo, saveState, flush } = useBuilderDraft({
    initialContent,
    title,
    save,
    enabled: !readOnly && online,
  });
  const contentRef = useRef(content);
  contentRef.current = content;
  const titleRef = useRef(title);
  titleRef.current = title;

  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);
  const [mealDay, setMealDay] = useState<MealDay>("all");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [preview, setPreview] = useState<PlanContent | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const days = useMemo(
    () =>
      [...content.workoutDays].sort((a, b) => {
        const aw = a.weekday == null ? 99 : WEEK_ORDER.indexOf(a.weekday as 0);
        const bw = b.weekday == null ? 99 : WEEK_ORDER.indexOf(b.weekday as 0);
        return aw - bw || a.order - b.order;
      }),
    [content.workoutDays],
  );
  const activeDay = days.find((day) => day.id === selectedDayId) ?? days[0] ?? null;
  const meals = sortedByOrder(content.mealPrescriptions);
  const activeMeal = meals.find((meal) => meal.id === selectedMealId) ?? meals[0] ?? null;
  const editable = !readOnly && mode !== "small";
  const overlay = mode === "narrow";

  const openLibrary = useCallback(() => {
    setLibraryOpen(true);
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "/" && !isTypingTarget(event.target) && editable) {
        event.preventDefault();
        if (mode === "narrow") setLibraryOpen(true);
        window.setTimeout(() => searchRef.current?.focus(), 0);
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "z" &&
        !event.shiftKey &&
        !isTypingTarget(event.target) &&
        editable
      ) {
        event.preventDefault();
        undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable, mode, undo]);

  function addExercise(item: ExerciseLibraryItem) {
    if (!activeDay) return;
    setLibraryError(null);
    try {
      let next = addExerciseFromLibrary(contentRef.current, activeDay.id, item);
      const day = next.workoutDays.find((candidate) => candidate.id === activeDay.id);
      const added = day ? sortedByOrder(day.exercises).at(-1) : undefined;
      if (day && added && added.setTargets.length === 0) {
        next = addSetTarget(next, day.id, added.id);
      }
      setContent(() => next);
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : "Couldn't add that exercise.");
    }
  }

  function addFood(item: FoodLibraryItem, servingId: string) {
    if (!activeMeal) return;
    setLibraryError(null);
    try {
      const next = addFoodItemFromLibrary(contentRef.current, activeMeal.id, item, servingId);
      setContent(() => next);
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : "Couldn't add that food.");
    }
  }

  async function openPreview() {
    setPreviewError(null);
    if (!loadPreview) {
      setPreview(contentRef.current);
      return;
    }
    await flush();
    try {
      setPreview(await loadPreview());
    } catch {
      setPreview(contentRef.current);
    }
  }

  async function publish() {
    if (!onPublish) return;
    const saved = await flush();
    const issues = publishIssues(contentRef.current, expectations);
    if (!saved && issues.blocking.length === 0) return;
    onPublish({ title: titleRef.current, content: contentRef.current, issues });
  }

  const retrySave = () => void flush();
  const conflict = saveState.kind === "conflict";

  const topbar = (
    <>
      <div className="builder-topbar-main">
        <Link className="builder-back" to={backTo}>
          ← {backLabel}
        </Link>
        <div className="builder-titleline">
          <label className="field builder-title-field">
            <span className="sr-only">Plan title</span>
            <input
              value={title}
              maxLength={160}
              disabled={readOnly}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <p
            className={`builder-status is-${saveState.kind}`}
            role="status"
            aria-live="polite"
            data-testid="autosave-status"
          >
            {statusLabel} · {statusText(saveState)}
            {saveState.kind === "error" ? (
              <>
                {" "}
                <button type="button" className="button-link" onClick={retrySave}>
                  Retry
                </button>
              </>
            ) : null}
          </p>
        </div>
      </div>
      {onTabChange ? (
        <div className="builder-tabs" role="tablist" aria-label="Plan section">
          {(["workout", "nutrition"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={tab === value ? "builder-tab is-active" : "builder-tab"}
              onClick={() => onTabChange(value)}
            >
              {value === "workout" ? "Workout" : "Nutrition"}
            </button>
          ))}
        </div>
      ) : null}
      <div className="builder-topbar-actions">
        {overlay && editable ? (
          <button type="button" className="button-secondary" onClick={openLibrary}>
            Library
          </button>
        ) : null}
        <button
          type="button"
          className="button-ghost"
          disabled={!canUndo || !editable}
          onClick={undo}
        >
          Undo
        </button>
        <button type="button" className="button-secondary" onClick={() => void openPreview()}>
          Preview as client
        </button>
        {onPublish ? (
          <button
            type="button"
            className="button-primary"
            disabled={readOnly || !online || conflict || mode === "small"}
            onClick={() => void publish()}
          >
            {publishLabel}
          </button>
        ) : null}
      </div>
    </>
  );

  const bannerNode = (
    <>
      {!online ? (
        <p className="builder-banner is-offline" role="status">
          You&apos;re offline. Changes can&apos;t be saved until you reconnect.
        </p>
      ) : null}
      {conflict ? (
        <p className="builder-banner is-attention" role="alert">
          This draft was changed in another tab.{" "}
          <button type="button" className="button-link" onClick={() => window.location.reload()}>
            Reload the latest
          </button>
        </p>
      ) : null}
      {saveState.kind === "error" ? (
        <p className="builder-banner is-attention" role="alert">
          Couldn&apos;t save your latest change. {saveState.message}{" "}
          <button type="button" className="button-link" onClick={retrySave}>
            Retry
          </button>
        </p>
      ) : null}
      {readOnlyNote ? <div className="builder-banner is-info">{readOnlyNote}</div> : null}
      {previewError ? (
        <p className="builder-banner is-attention" role="alert">
          {previewError}
        </p>
      ) : null}
      {banner}
    </>
  );

  return (
    <section className="page plan-builder-page" data-testid={screenId}>
      <BuilderLayout
        mode={mode}
        topbar={topbar}
        banner={bannerNode}
        left={
          tab === "workout" ? (
            <DaysPane
              content={content}
              selectedId={activeDay?.id ?? null}
              onSelect={setSelectedDayId}
              onChange={setContent}
              readOnly={!editable}
            />
          ) : (
            <MealDaysPane
              content={content}
              selectedDay={mealDay}
              onSelectDay={setMealDay}
              selectedMealId={activeMeal?.id ?? null}
              onChange={setContent}
              readOnly={!editable}
            />
          )
        }
        center={
          tab === "workout" ? (
            <SessionEditor
              day={activeDay}
              onChange={setContent}
              readOnly={!editable}
              onOpenLibrary={openLibrary}
              showLibraryToggle={overlay}
            />
          ) : (
            <MealsPane
              content={content}
              selectedDay={mealDay}
              selectedMealId={activeMeal?.id ?? null}
              onSelectMeal={setSelectedMealId}
              onChange={setContent}
              readOnly={!editable}
              photoRequirement={expectations?.photoRequirement ?? null}
              onOpenLibrary={openLibrary}
              showLibraryToggle={overlay}
            />
          )
        }
        right={
          editable ? (
            <>
              <LibraryDrawer
                kind={tab}
                day={activeDay}
                meal={activeMeal}
                onAddExercise={addExercise}
                onAddFood={addFood}
                searchRef={searchRef}
                overlay={overlay}
                open={libraryOpen}
                onClose={() => setLibraryOpen(false)}
              />
              {libraryError ? (
                <p className="form-error library-error" role="alert">
                  {libraryError}
                </p>
              ) : null}
            </>
          ) : null
        }
        smallScreen={<ReadOnlySummary content={content} />}
      />
      {preview ? (
        <PhonePreview content={preview} clientName={clientName} onClose={() => setPreview(null)} />
      ) : null}
    </section>
  );
}
