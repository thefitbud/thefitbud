import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AlertCircle, CalendarDays, ChevronDown, ChevronLeft, Clock, Lock } from "lucide-react-native";
import { ApiClientError } from "@fitbud/api-client";
import type { WorkoutAssignment, WorkoutExecution } from "@fitbud/contracts";
import { formatCivilDate, formatPersonName } from "@fitbud/core";
import { colors, fontFamilySemiBold, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../../auth/AuthProvider";
import { Screen } from "../../components/Screen";
import { Text } from "../../components/Text";
import { createIdempotencyKey } from "../../lib/idempotency";
import { dayOfMonth, localDateInTimezone, weekdayShort } from "../../lib/dates";
import { reportError } from "../../lib/reportError";
import {
  SetEntryHeader,
  SetEntryRow,
  SetKeypad,
  backspace,
  draftForSet,
  pressKey,
  stepValue,
  type KeypadField,
  type SetDraft,
} from "../../workout/shared";
import {
  assignmentsOn,
  authorshipLabel,
  buildEditBody,
  buildLogBody,
  dateStrip,
  draftsFor,
  exerciseSummary,
  exercisesFromAssignment,
  exercisesFromExecution,
  isEditableSet,
  isFinishedExecution,
  isNetworkError,
  loggableAssignments,
  performedAtFor,
  plannedText,
  type FormExercise,
} from "./model";

type Props = {
  relationshipId: string;
  displayName: string;
  /** Ended clients are read-only (frame d5). */
  ended: boolean;
  /** The client's calendar decides "today" and the 7-day window. */
  clientZone: string;
  /** A day to open on (the Edit entry on Recent activity). */
  initialDate?: string;
  /** The workout to open on (the Edit entry on Recent activity); wins over the day's first one. */
  initialAssignmentId?: string;
  onBack: () => void;
  /** Called after a save, with the toast text. */
  onSaved: (message: string) => void;
};

type Save =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "failed"; message: string; stale: boolean };

const NETWORK_COPY =
  "Not saved. We couldn’t reach FitBud, so nothing was saved. Your entries are still here. Check your connection and try again.";

export function ClientLogWorkoutScreen({
  relationshipId,
  displayName,
  ended,
  clientZone,
  initialDate,
  initialAssignmentId,
  onBack,
  onSaved,
}: Props) {
  const { api } = useAuth();
  const name = formatPersonName(displayName);
  const first = name.split(" ")[0] || name;
  const today = localDateInTimezone(clientZone);
  const strip = useMemo(() => dateStrip(today), [today]);
  const earliest = strip[0]!;
  const [date, setDate] = useState(
    initialDate && strip.includes(initialDate) ? initialDate : today,
  );
  const [assignments, setAssignments] = useState<WorkoutAssignment[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [picked, setPicked] = useState<string | null>(initialAssignmentId ?? null);
  const [choosing, setChoosing] = useState(false);
  const [execution, setExecution] = useState<WorkoutExecution | null>(null);
  const [exercises, setExercises] = useState<FormExercise[]>([]);
  const [drafts, setDrafts] = useState<Record<string, SetDraft>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [keypad, setKeypad] = useState<{ setId: string; field: KeypadField; replace: boolean } | null>(null);
  const [save, setSave] = useState<Save>({ state: "idle" });
  const [reloadEpoch, setReloadEpoch] = useState(0);
  const idempotencyKey = useRef(createIdempotencyKey());

  const loadAssignments = useCallback(async () => {
    setLoadFailed(false);
    try {
      const page = await api.listWorkoutAssignments(relationshipId, {
        fromDate: earliest,
        toDate: today,
      });
      setAssignments(page.items);
    } catch (err) {
      reportError("client-log.assignments", err);
      setLoadFailed(true);
    }
  }, [api, relationshipId, earliest, today]);

  useEffect(() => {
    if (!ended) void loadAssignments();
  }, [ended, loadAssignments]);

  const all = useMemo(() => loggableAssignments(assignments ?? []), [assignments]);
  const offered = useMemo(() => assignmentsOn(assignments ?? [], date), [assignments, date]);
  const assignment: WorkoutAssignment | null =
    (picked ? all.find((a) => a.id === picked) : null) ?? offered[0] ?? null;
  const editing = assignment != null && isFinishedExecution(assignment);

  useEffect(() => {
    let cancelled = false;
    setExecution(null);
    setKeypad(null);
    setSave({ state: "idle" });
    // A different entry is a different logical log.
    idempotencyKey.current = createIdempotencyKey();
    if (!assignment) {
      setExercises([]);
      setDrafts({});
      return;
    }
    function show(ex: FormExercise[]) {
      setExercises(ex);
      setDrafts(draftsFor(ex));
      setOpen(ex[0]?.key ?? null);
    }
    if (assignment.execution && isFinishedExecution(assignment)) {
      setExercises([]);
      void api
        .getWorkoutExecution(assignment.execution.id)
        .then((e) => {
          if (cancelled) return;
          setExecution(e);
          show(exercisesFromExecution(e));
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          reportError("client-log.execution", err);
          setSave({ state: "failed", message: "Couldn’t load this entry. LOG-LOAD", stale: true });
        });
    } else {
      show(exercisesFromAssignment(assignment));
    }
    return () => {
      cancelled = true;
    };
    // assignment identity changes with every list reload; its id is what matters
  }, [api, assignment?.id, assignment?.execution?.id, reloadEpoch]);

  function changeDraft(setId: string, patch: Partial<SetDraft>) {
    setDrafts((prev) => {
      const set = exercises.flatMap((e) => e.sets).find((s) => s.id === setId);
      if (!set) return prev;
      return { ...prev, [setId]: { ...draftForSet({ ...set, prescribedLoadLabel: set.prescribedLoadLabel }, prev), ...patch } };
    });
    if (save.state === "failed" && !save.stale) setSave({ state: "idle" });
  }

  const keyedDraft = (setId: string): SetDraft => drafts[setId] ?? { load: "", reps: "", bodyweight: false };

  function onKey(key: string) {
    if (!keypad) return;
    const d = keyedDraft(keypad.setId);
    changeDraft(keypad.setId, { [keypad.field]: pressKey(d[keypad.field], key, keypad.field, keypad.replace) });
    setKeypad({ ...keypad, replace: false });
  }
  function onBackspace() {
    if (!keypad) return;
    const d = keyedDraft(keypad.setId);
    changeDraft(keypad.setId, { [keypad.field]: backspace(d[keypad.field], keypad.replace) });
    setKeypad({ ...keypad, replace: false });
  }
  function onStep(direction: 1 | -1) {
    if (!keypad) return;
    const d = keyedDraft(keypad.setId);
    const base = keypad.field === "load" && d.load.trim() === "" ? "0" : d[keypad.field];
    changeDraft(keypad.setId, { [keypad.field]: stepValue(base, direction, keypad.field) });
    setKeypad({ ...keypad, replace: true });
  }
  function onBodyweight(bodyweight: boolean) {
    if (!keypad) return;
    changeDraft(keypad.setId, { bodyweight });
    if (!bodyweight && keypad.field === "reps") setKeypad({ ...keypad, field: "load", replace: true });
  }
  function onPrimary() {
    if (!keypad) return;
    if (keypad.field === "load") setKeypad({ ...keypad, field: "reps", replace: true });
    else setKeypad(null);
  }

  const editBody = editing && execution ? buildEditBody(exercises, drafts, execution.recordVersion) : null;
  const canSave =
    save.state !== "saving" &&
    exercises.length > 0 &&
    (editing ? editBody != null : true) &&
    !(save.state === "failed" && save.stale);

  async function doSave() {
    if (!assignment || !canSave) return;
    setSave({ state: "saving" });
    try {
      if (editing) {
        await api.editClientWorkout(execution!.id, editBody!);
        onSaved("Edited by you");
      } else {
        const performedAt = performedAtFor(date, today, clientZone, new Date());
        await api.logClientWorkout(
          assignment.id,
          buildLogBody(exercises, drafts, performedAt),
          idempotencyKey.current,
        );
        onSaved("Logged by you");
      }
    } catch (err) {
      if (isNetworkError(err)) {
        setSave({ state: "failed", message: NETWORK_COPY, stale: false });
        return;
      }
      reportError("client-log.save", err);
      if (err instanceof ApiClientError) {
        // Only a 4xx is a definite refusal (nothing was applied), so the next try is a new send.
        // A 5xx or status 0 may have been applied server-side: keep the key so a retry replays.
        if (err.status >= 400 && err.status < 500) idempotencyKey.current = createIdempotencyKey();
        setSave({
          state: "failed",
          message: `Not saved. ${err.message} Your entries are still here.`,
          stale: err.code === "VERSION_CONFLICT",
        });
      } else {
        setSave({
          state: "failed",
          message: "Not saved. Something went wrong. Your entries are still here. LOG-SAVE",
          stale: false,
        });
      }
    }
  }

  const header = (
    <View style={styles.head}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.backHit}>
        <ChevronLeft color={colors.deepNavy} size={26} />
      </Pressable>
      <View style={styles.headTx}>
        <Text style={styles.title} accessibilityRole="header">Log workout</Text>
        <Text style={styles.subtitle}>{name}</Text>
      </View>
      <View style={styles.backHit} />
    </View>
  );

  if (ended) {
    return (
      <Screen title="" showHeader={false} chrome="app">
        {header}
        <View style={styles.center}>
          <View style={[styles.badge, styles.badgeGrey]}>
            <Lock color={colors.deepNavy} size={26} />
          </View>
          <Text style={styles.centerTitle}>Coaching with {first} has ended</Text>
          <Text style={styles.centerBody}>
            Ended clients are read-only, so you can’t log workouts for them. Reactivate coaching
            from their client page to log again.
          </Text>
          <Pressable accessibilityRole="button" onPress={onBack} style={[styles.outlined, styles.centered]}>
            <Text style={styles.outlinedText}>Open {first}’s page</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const keypadSet = keypad ? exercises.flatMap((e) => e.sets).find((s) => s.id === keypad.setId) : null;
  const footer =
    keypad && keypadSet ? (
      <SetKeypad
        field={keypad.field}
        setOrder={keypadSet.order}
        bodyweight={keyedDraft(keypad.setId).bodyweight}
        onBodyweightChange={onBodyweight}
        onKey={onKey}
        onBackspace={onBackspace}
        onStep={onStep}
        onPrimary={onPrimary}
        onClose={() => setKeypad(null)}
        primaryLabel={keypad.field === "load" ? "Next: reps" : "Done"}
      />
    ) : assignment && exercises.length > 0 ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          save.state === "saving" ? "Saving…" : save.state === "failed" && !save.stale ? "Try again" : editing ? "Save changes" : "Save workout"
        }
        accessibilityState={{ disabled: !canSave, busy: save.state === "saving" }}
        disabled={!canSave}
        onPress={() => void doSave()}
        style={[styles.saveBtn, save.state === "saving" ? styles.saveBusy : null, !canSave && save.state !== "saving" ? styles.saveOff : null]}
      >
        {save.state === "saving" ? <Clock color={colors.white} size={20} /> : null}
        <Text style={styles.saveText}>
          {save.state === "saving" ? "Saving…" : save.state === "failed" && !save.stale ? "Try again" : editing ? "Save changes" : "Save workout"}
        </Text>
      </Pressable>
    ) : null;

  const authorship = execution ? authorshipLabel(execution) : null;

  return (
    <Screen title="" showHeader={false} chrome="app" footer={footer ?? undefined}>
      {header}
      {save.state === "failed" ? (
        <View style={styles.errBox} accessibilityRole="alert">
          <AlertCircle color={colors.error} size={22} />
          <Text style={styles.errText}>{save.message}</Text>
        </View>
      ) : null}
      <Text style={styles.label}>Date · up to 7 days back</Text>
      <View style={styles.strip}>
        {strip.map((d) => {
          const on = d === date;
          return (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityLabel={formatCivilDate(d)}
              accessibilityState={{ selected: on }}
              onPress={() => {
                setDate(d);
                setPicked(null);
                setChoosing(false);
              }}
              style={[styles.chip, on ? styles.chipOn : null]}
            >
              <Text style={styles.chipDow}>{weekdayShort(clientZone, d)}</Text>
              <Text style={styles.chipDay}>{dayOfMonth(clientZone, d)}</Text>
            </Pressable>
          );
        })}
      </View>
      {date === earliest ? (
        <View style={styles.note}>
          <CalendarDays color={colors.deepNavy} size={22} />
          <Text style={styles.noteText}>
            You can log up to 7 days back, so {formatCivilDate(earliest)} is the earliest. Older
            workouts can’t be added.
          </Text>
        </View>
      ) : null}
      <Text style={[styles.label, styles.labelGap]}>Workout</Text>
      {loadFailed ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Couldn’t load the plan</Text>
          <Pressable accessibilityRole="button" onPress={() => void loadAssignments()} style={styles.outlined}>
            <Text style={styles.outlinedText}>Try again</Text>
          </Pressable>
        </View>
      ) : assignments == null ? (
        <View style={[styles.card, styles.skeleton]} />
      ) : assignment && !choosing ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose a different workout"
            disabled={all.length < 2}
            onPress={() => setChoosing(true)}
            style={[styles.card, styles.rowCard]}
          >
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{assignment.workoutDayName}</Text>
              <Text style={styles.cardSub}>
                Planned for {formatCivilDate(assignment.localDate)} · {assignment.workoutDay.exercises.length}{" "}
                {assignment.workoutDay.exercises.length === 1 ? "exercise" : "exercises"}
                {authorship ? ` · ${authorship}` : ""}
              </Text>
            </View>
            {all.length > 1 ? <ChevronDown color={colors.deepNavy} size={22} /> : null}
          </Pressable>
          {exercises.map((ex, index) => (
            <ExerciseCard
              key={ex.key}
              index={index + 1}
              exercise={ex}
              expanded={open === ex.key}
              drafts={drafts}
              editing={editing}
              activeSetId={keypad?.setId ?? null}
              activeField={keypad?.field ?? null}
              onToggle={() => setOpen(open === ex.key ? null : ex.key)}
              onOpenField={(setId, field) => setKeypad({ setId, field, replace: true })}
            />
          ))}
        </>
      ) : choosing || all.length > 0 ? (
        <View style={styles.card}>
          {!choosing ? (
            <>
              <Text style={styles.cardTitle}>Nothing planned on {formatCivilDate(date)}</Text>
              <Text style={styles.cardSub}>
                Pick another day, or choose a workout from {first}’s current plan.
              </Text>
              <Pressable accessibilityRole="button" onPress={() => setChoosing(true)} style={styles.outlined}>
                <Text style={styles.outlinedText}>Choose a workout</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.cardTitle}>Choose a workout</Text>
              {all.map((a) => (
                <Pressable
                  key={a.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setPicked(a.id);
                    setChoosing(false);
                  }}
                  style={styles.pickRow}
                >
                  <Text style={styles.pickName}>{a.workoutDayName}</Text>
                  <Text style={styles.cardSub}>
                    Planned for {formatCivilDate(a.localDate)}
                    {isFinishedExecution(a) ? " · already logged" : ""}
                  </Text>
                </Pressable>
              ))}
            </>
          )}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nothing planned on {formatCivilDate(date)}</Text>
          <Text style={styles.cardSub}>There is no workout to log in the last 7 days.</Text>
        </View>
      )}
      {save.state === "failed" && save.stale ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setSave({ state: "idle" });
            void loadAssignments();
            setReloadEpoch((n) => n + 1);
          }}
          style={styles.outlined}
        >
          <Text style={styles.outlinedText}>Reload entry</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

function ExerciseCard({
  index,
  exercise,
  expanded,
  drafts,
  editing,
  activeSetId,
  activeField,
  onToggle,
  onOpenField,
}: {
  index: number;
  exercise: FormExercise;
  expanded: boolean;
  drafts: Record<string, SetDraft>;
  editing: boolean;
  activeSetId: string | null;
  activeField: KeypadField | null;
  onToggle: () => void;
  onOpenField: (setId: string, field: KeypadField) => void;
}) {
  const summary = exerciseSummary(exercise.sets);
  if (!expanded) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: false }}
        accessibilityLabel={`${exercise.name}, ${summary}`}
        onPress={onToggle}
        style={[styles.card, styles.rowCard]}
      >
        <View style={styles.num}>
          <Text style={styles.numText}>{index}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{exercise.name}</Text>
          <Text style={styles.cardSub}>
            {summary}
            {editing ? "" : " · prefilled from plan"}
          </Text>
        </View>
        <ChevronDown color={colors.deepNavy} size={22} />
      </Pressable>
    );
  }
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: true }}
        accessibilityLabel={`${exercise.name}, ${summary}`}
        onPress={onToggle}
        style={styles.exHead}
      >
        <Text style={styles.cardTitle}>{exercise.name}</Text>
        <Text style={styles.cardSub}>{summary}</Text>
      </Pressable>
      <SetEntryHeader secondColumnLabel="Planned" showTick={false} />
      {exercise.sets.map((set) =>
        !isEditableSet(set) ? (
          <View key={set.id} style={styles.skippedRow}>
            <Text style={styles.skippedNo}>{set.order}</Text>
            <Text style={styles.skippedPlan}>{plannedText(set)}</Text>
            <Text style={styles.skippedTag}>{set.status === "skipped" ? "Skipped" : "Not logged"}</Text>
          </View>
        ) : (
        <SetEntryRow
          key={set.id}
          set={{
            id: set.id,
            order: set.order,
            status: "pending",
            prescribedLoadLabel: set.prescribedLoadLabel,
            prescribedReps: set.prescribedReps,
          }}
          isNow={false}
          editable
          filled
          draft={drafts[set.id] ?? { load: "", reps: "", bodyweight: false }}
          previousLabel={plannedText(set)}
          activeField={activeSetId === set.id ? activeField : null}
          onOpenField={(field) => onOpenField(set.id, field)}
        />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: "center", flexDirection: "row", marginBottom: spacing.md },
  backHit: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  headTx: { alignItems: "center", flex: 1 },
  title: { color: colors.deepNavy, fontFamily: fontFamilySemiBold, fontSize: 20, fontWeight: "600" },
  subtitle: { color: colors.midGrey, fontSize: 15, fontWeight: "600", marginTop: 2 },
  label: {
    color: colors.midGrey,
    fontSize: 13,
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  labelGap: { marginTop: spacing.lg },
  strip: { flexDirection: "row", gap: 6 },
  chip: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 16,
    borderWidth: 1.5,
    flex: 1,
    justifyContent: "center",
    minHeight: 64,
  },
  chipOn: { backgroundColor: "#F9F7FF", borderColor: colors.indigo, borderWidth: 2.5 },
  chipDow: { color: colors.midGrey, fontSize: 13 },
  chipDay: { color: colors.deepNavy, fontSize: 20, fontWeight: "500", marginTop: 2 },
  note: {
    alignItems: "flex-start",
    backgroundColor: "#F3F4F6",
    borderColor: colors.lightGrey,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  noteText: { color: colors.deepNavy, flex: 1, fontSize: 15, lineHeight: 21 },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  rowCard: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 64 },
  exHead: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 44 },
  flex: { flex: 1, minWidth: 0 },
  cardTitle: { color: colors.deepNavy, fontFamily: fontFamilySemiBold, fontSize: 18, fontWeight: "500" },
  cardSub: { color: colors.midGrey, fontSize: 15, marginTop: 2 },
  skeleton: { minHeight: 80 },
  num: {
    alignItems: "center",
    backgroundColor: "#ECE9FF",
    borderRadius: 12,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  numText: { color: colors.indigo, fontSize: 18 },
  pickRow: { borderTopColor: colors.lightGrey, borderTopWidth: 1, marginTop: spacing.sm, minHeight: 56, paddingTop: spacing.sm },
  pickName: { color: colors.deepNavy, fontSize: 17, fontWeight: "600" },
  skippedRow: { alignItems: "center", flexDirection: "row", gap: 6, marginTop: 4, minHeight: 56, paddingHorizontal: 6 },
  skippedNo: { color: colors.midGrey, fontSize: 15, fontWeight: "700", textAlign: "center", width: 34 },
  skippedPlan: { color: colors.midGrey, flex: 1, fontSize: 14 },
  skippedTag: { color: colors.midGrey, fontSize: 15, fontWeight: "600" },
  outlined: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 22,
    borderWidth: 1.5,
    justifyContent: "center",
    marginTop: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.xl,
  },
  centered: { alignSelf: "center" },
  outlinedText: { color: colors.deepNavy, fontSize: 17, fontWeight: "600" },
  errBox: {
    alignItems: "flex-start",
    backgroundColor: "#FEF1F1",
    borderColor: "#F9C9C9",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  errText: { color: colors.error, flex: 1, fontSize: 15, lineHeight: 22 },
  saveBtn: {
    alignItems: "center",
    backgroundColor: colors.indigo,
    borderRadius: 28,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 56,
  },
  saveBusy: { backgroundColor: "#7C68D6" },
  saveOff: { opacity: 0.45 },
  saveText: { color: colors.white, fontSize: 18, fontWeight: "600" },
  center: { alignItems: "center", paddingTop: 80 },
  badge: { alignItems: "center", borderRadius: 44, height: 88, justifyContent: "center", width: 88 },
  badgeGrey: { backgroundColor: "#F3F4F6" },
  centerTitle: { color: colors.deepNavy, fontSize: 24, marginTop: spacing.lg, textAlign: "center" },
  centerBody: { color: colors.midGrey, fontSize: 17, lineHeight: 25, marginTop: spacing.md, textAlign: "center" },
});
