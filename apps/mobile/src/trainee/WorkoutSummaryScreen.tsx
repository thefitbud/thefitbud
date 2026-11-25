import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { ArrowLeft, ArrowUpRight, Check, Minus, Send, SkipForward } from "lucide-react-native";
import { Text } from "../components/Text";
import type { WorkoutAssignment, WorkoutExecution } from "@fitbud/contracts";
import { formatClockTime, formatInstant, formatNumber } from "@fitbud/core";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { BottomSheet } from "../components/BottomSheet";
import { OfflineBanner } from "../components/OfflineBanner";
import { Screen } from "../components/Screen";
import { localDateInTimezone, startOfWeekMonday, weekdayShort } from "../lib/dates";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";
import { CoachLogBanner } from "./workout/coach-logged/CoachLogBanner";
import { coachLogState } from "./workout/coach-logged/coachLogged";
import { durationMinutesFromExecution } from "./workoutDuration";
import { formatCivilDateShort, planChangeRows } from "./workoutDisplay";
import {
  weekWorkoutSummary,
  withFinishedExecution,
} from "./workoutHeroState";
import { sessionSetCounts, sessionVolumeKg } from "./workoutSession";
import { RpePicker } from "./workout/rpePicker";
import { WORKOUT_SESSION_NOTE_MAX_LENGTH } from "@fitbud/contracts";
import {
  RATING_HELD_MESSAGE,
  RATING_NOTE_HELD_MESSAGE,
  RATING_NOTE_QUEUED_MESSAGE,
  RATING_NOTE_WINDOW_CLOSED_MESSAGE,
  RATING_QUEUED_MESSAGE,
  normalizeNote,
  type FeedbackChange,
  type RatingOutcome,
} from "./workout/rpeRating";
import { useSheetDraft, type SheetDraftHandle } from "./workout/sheetDrafts";

/** What the rating-and-note draft keeps (Z14-37). */
type FeedbackDraft = { rpe: number | null; note: string };
type FeedbackDraftHandle = SheetDraftHandle<FeedbackDraft>;

/**
 * The workout summary (v3 W-17a), then the shared confirmation (W-17b).
 *
 * The week card's dots and its "N of M done" come from one list
 * (`weekWorkoutSummary`) with the finished assignment patched to done
 * (`withFinishedExecution`), so they cannot disagree (ISSUE-MAP #10: "3 of 3"
 * beside two ticks, from a week list loaded before the finish).
 *
 * The workout is already saved and visible to the coach when this screen
 * opens: the finish sent it (or queued it, offline). "Save and share" moves
 * to the confirmation; it sends nothing new.
 *
 * Z14-12 (D-W14-10, D-W14-20) and Z14-32 (D-W14-34): after a finish the
 * summary asks how hard it was (W-17a2, optional unless the plan requires it,
 * W-17a3) and offers a short note for the coach. "Save and share" sends the
 * rating and the note together through `onSaveFeedback` (the
 * `workout.feedback` outbox mutation) and only then moves on; nothing is sent
 * on a pick. `mode="view"` is the read-only summary of a finished workout
 * (W-17c, "Your rating and note"): while the API's `feedbackEditableUntil` is
 * in the future one "Change" opens the sheet with the grid and the note
 * (W-17c2), afterwards the group is plain text (W-17c3). Records are not
 * computed.
 *
 * Z14-37: the rating and note typed but not yet saved are kept as a device
 * draft (`useSheetDraft`, keyed by the signed-in user and the workout), so a
 * cover unmounting the tab or a restart does not lose them. Nothing on screen
 * says so: the fields simply still hold what was typed.
 */
export function WorkoutSummaryScreen({
  execution,
  assignment = null,
  onDone,
  coachName = "Your coach",
  weekAssignments = [],
  weekStart,
  today = "",
  timeZone = "Asia/Kolkata",
  offline = false,
  mode = "after_finish",
  onSaveFeedback,
  now,
  draftOwnerId = null,
}: {
  execution: WorkoutExecution;
  assignment?: WorkoutAssignment | null;
  onDone: () => void;
  /** `view`: the read-only summary of a finished workout (W-17c). */
  mode?: "after_finish" | "view";
  /**
   * Sends one rating and/or note change and resolves with the server's verdict. The
   * caller owns the version (never guessed here); `progress("held")` says the
   * pick is waiting for the finish to be sent.
   */
  onSaveFeedback?: (
    change: FeedbackChange,
    progress: (state: "held") => void,
  ) => Promise<RatingOutcome> | void;
  /** The clock for the 48 h rule (tests). */
  now?: Date;
  /** The signed-in user; drafts are kept for this user only (Z14-37). */
  draftOwnerId?: string | null;
  coachName?: string;
  weekAssignments?: readonly WorkoutAssignment[];
  weekStart?: string;
  timeZone?: string;
  today?: string;
  offline?: boolean;
}) {
  const [shared, setShared] = useState(false);
  const [rpe, setRpe] = useState<number | null>(execution.sessionRpe);
  const [note, setNote] = useState<string>(execution.sessionNote ?? "");
  const [rating, setRating] = useState<RatingNotice>({ kind: "idle" });
  // Closed by the server: the group is plain text from then on (W-17c3).
  const [windowClosed, setWindowClosed] = useState(false);
  // What the server last confirmed; a refusal puts the screen back to it.
  const confirmedRef = useRef<{ rpe: number | null; note: string | null }>({
    rpe: execution.sessionRpe,
    note: normalizeNote(execution.sessionNote),
  });
  const inflightRef = useRef(false);
  const wantedRef = useRef<FeedbackChange | null>(null);
  // After a finish, a good verdict moves on to the shared step.
  const shareOnDoneRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Z14-37: typing not yet saved survives an unmount or a restart.
  const feedbackDraft = useSheetDraft<FeedbackDraft>({
    ownerId: draftOwnerId,
    sheet: "workoutFeedback",
    entityId: execution.id,
  });
  const touchedRef = useRef(false);
  const typedRef = useRef<FeedbackDraft>({ rpe, note });
  typedRef.current = { rpe, note };
  useEffect(() => {
    if (mode !== "after_finish") return;
    let live = true;
    void feedbackDraft.read().then((draft) => {
      if (!live || !draft || touchedRef.current) return;
      setRpe(draft.rpe);
      setNote(draft.note);
    });
    return () => {
      live = false;
    };
  }, [feedbackDraft, mode]);
  function pickRpe(next: number | null) {
    touchedRef.current = true;
    setRpe(next);
    feedbackDraft.schedule({ rpe: next, note: typedRef.current.note });
  }
  function changeNote(next: string) {
    touchedRef.current = true;
    setNote(next);
    feedbackDraft.schedule({ rpe: typedRef.current.rpe, note: next });
  }

  /**
   * One send at a time: a change made while another is being sent is merged
   * (the later value of a field wins) and goes out when the first has its
   * verdict.
   */
  async function sendFeedback(change: FeedbackChange) {
    wantedRef.current = { ...wantedRef.current, ...change };
    if (inflightRef.current) return;
    inflightRef.current = true;
    try {
      while (wantedRef.current) {
        const sending = wantedRef.current;
        wantedRef.current = null;
        if (mountedRef.current) setRating({ kind: "saving", withNote: sending.note !== undefined });
        const outcome = await onSaveFeedback?.(sending, (state) => {
          if (state === "held" && mountedRef.current && !wantedRef.current) {
            setRating({ kind: "held", withNote: sending.note !== undefined });
            if (shareOnDoneRef.current) setShared(true);
          }
        });
        if (wantedRef.current || !mountedRef.current) continue;
        if (!outcome) {
          setRating({ kind: "idle" });
        } else if (outcome.kind === "saved") {
          confirmedRef.current = { rpe: outcome.rpe, note: outcome.note };
          setRating({ kind: "idle" });
          if (shareOnDoneRef.current) setShared(true);
        } else if (outcome.kind === "queued") {
          setRating({ kind: "queued", withNote: sending.note !== undefined });
          if (shareOnDoneRef.current) setShared(true);
        } else {
          if (outcome.serverRpe !== undefined) confirmedRef.current.rpe = outcome.serverRpe;
          if (outcome.serverNote !== undefined) confirmedRef.current.note = outcome.serverNote;
          setRpe(confirmedRef.current.rpe);
          // After a finish the typed note stays on screen so it is not lost;
          // the read-only view goes back to what the server holds.
          if (mode === "view") setNote(confirmedRef.current.note ?? "");
          if (outcome.reason === "window_closed") setWindowClosed(true);
          shareOnDoneRef.current = false;
          setShared(false);
          setRating({
            kind: "refused",
            message: outcome.message,
            retryChange: outcome.reason === "other" ? sending : undefined,
          });
        }
      }
    } finally {
      inflightRef.current = false;
    }
  }

  /** Only what differs from what the server holds goes out. */
  function changeSinceConfirmed(next: { rpe: number | null; note: string }): FeedbackChange {
    const change: FeedbackChange = {};
    if (next.rpe !== confirmedRef.current.rpe) change.rpe = next.rpe;
    if (normalizeNote(next.note) !== confirmedRef.current.note) change.note = next.note;
    return change;
  }

  /** "Save and share": rating and note together, then the shared step. */
  function saveAndShare() {
    feedbackDraft.clear();
    const change = changeSinceConfirmed({ rpe, note });
    if (Object.keys(change).length === 0) {
      setShared(true);
      return;
    }
    shareOnDoneRef.current = true;
    void sendFeedback(change);
  }
  /** Try again after a refusal: the same change, nothing lost. */
  function retry(change: FeedbackChange) {
    if (mode !== "view") shareOnDoneRef.current = true;
    void sendFeedback(change);
  }
  /** The Change sheet's Save: sends only what changed. */
  function saveFromSheet(next: { rpe: number | null; note: string }) {
    const change = changeSinceConfirmed(next);
    setRpe(next.rpe);
    setNote(next.note);
    if (Object.keys(change).length > 0) void sendFeedback(change);
  }
  const trimmedCoach = coachName.trim() || "Your coach";
  const coachFirst =
    trimmedCoach.toLowerCase() === "your coach"
      ? "your coach"
      : trimmedCoach.split(/\s+/)[0]!;

  const rpeBlocked = execution.requireSessionRpe && rpe == null;
  const saving = rating.kind === "saving";
  const footer =
    mode === "view" || shared ? (
      <SummaryFooter label="Done" onPress={onDone} />
    ) : (
      <SummaryFooter
        label={`Save and share with ${coachFirst}`}
        share
        disabled={rpeBlocked || saving}
        hint={rpeBlocked ? "Pick how hard it was to save." : undefined}
        onPress={saveAndShare}
      />
    );

  if (mode === "view") {
    return (
      <Screen v3 chrome="app" title="Workout summary" showHeader={false} footer={footer}>
        <ViewBody
          execution={execution}
          assignment={assignment}
          coachFirst={coachFirst}
          timeZone={timeZone}
          rpe={rpe}
          note={note}
          rating={rating}
          windowClosed={windowClosed}
          now={now}
          onBack={onDone}
          onSave={saveFromSheet}
          onRetry={retry}
          draftStore={feedbackDraft}
        />
      </Screen>
    );
  }

  return (
    <Screen
      v3
      chrome="app"
      title={shared ? `Shared with ${coachFirst}` : "Workout done"}
      showHeader={false}
      footer={footer}
    >
      {shared ? (
        <SharedBody
          rating={rating}
          onRetry={retry}
          execution={execution}
          assignment={assignment}
          coachFirst={coachFirst}
          weekAssignments={weekAssignments}
          weekStart={weekStart ?? assignment?.localDate ?? today}
          timeZone={timeZone}
          offline={offline}
        />
      ) : (
        <SummaryBody
          execution={execution}
          assignment={assignment}
          coachName={trimmedCoach}
          coachFirst={coachFirst}
          timeZone={timeZone}
          offline={offline}
          rpe={rpe}
          note={note}
          confirmedRpe={confirmedRef.current.rpe}
          rating={rating}
          windowClosed={windowClosed}
          onPickRpe={pickRpe}
          onChangeNote={changeNote}
          onRetry={retry}
        />
      )}
    </Screen>
  );
}

type RatingNotice =
  | { kind: "idle" }
  | { kind: "saving"; withNote: boolean }
  | { kind: "held"; withNote: boolean }
  | { kind: "queued"; withNote: boolean }
  | { kind: "refused"; message: string; retryChange?: FeedbackChange };

/** What happened to the last rating pick, in plain words (no codes). */
function RatingLine({
  rating,
  onRetry,
}: {
  rating: RatingNotice;
  onRetry: (change: FeedbackChange) => void;
}) {
  const styles = useStyles();
  if (rating.kind === "idle" || rating.kind === "saving") return null;
  const text =
    rating.kind === "held"
      ? rating.withNote
        ? RATING_NOTE_HELD_MESSAGE
        : RATING_HELD_MESSAGE
      : rating.kind === "queued"
        ? rating.withNote
          ? RATING_NOTE_QUEUED_MESSAGE
          : RATING_QUEUED_MESSAGE
        : rating.message;
  return (
    <View style={styles.ratingNotice} accessibilityLiveRegion="polite">
      <Text variant="subhead" tone={rating.kind === "refused" ? "crit" : "ink2"}>
        {text}
      </Text>
      {rating.kind === "refused" && rating.retryChange !== undefined ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={() => onRetry(rating.retryChange ?? {})}
          hitSlop={12}
          style={styles.changeHit}
        >
          <Text variant="bodyStrong">Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SummaryFooter({
  label,
  share = false,
  disabled = false,
  hint,
  onPress,
}: {
  label: string;
  share?: boolean;
  disabled?: boolean;
  hint?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.abar}>
      <Button
        label={label}
        icon={
          share ? (
            <Send size={20} color={theme.colors.onBrand} strokeWidth={1.75} />
          ) : undefined
        }
        disabled={disabled}
        onPress={onPress}
        style={styles.footerBtn}
      />
      {hint ? (
        <Text variant="subhead" tone="ink2" style={styles.footerHint}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function SummaryBody({
  execution,
  assignment,
  coachName,
  coachFirst,
  timeZone,
  offline,
  rpe,
  note,
  confirmedRpe,
  rating,
  windowClosed,
  onPickRpe,
  onChangeNote,
  onRetry,
}: {
  execution: WorkoutExecution;
  assignment: WorkoutAssignment | null;
  coachName: string;
  coachFirst: string;
  timeZone: string;
  offline: boolean;
  rpe: number | null;
  note: string;
  confirmedRpe: number | null;
  rating: RatingNotice;
  windowClosed: boolean;
  onPickRpe: (next: number | null) => void;
  onChangeNote: (next: string) => void;
  onRetry: (change: FeedbackChange) => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const counts = sessionSetCounts(execution);
  const volume = sessionVolumeKg(execution);
  const minutes = durationMinutesFromExecution(execution);
  const changeRows = useMemo(() => planChangeRows(execution), [execution]);
  const sessionTitle = assignment?.workoutDayName ?? "Workout";
  const eyebrow = (
    assignment?.localDate != null
      ? `${sessionTitle} · ${formatCivilDateShort(assignment.localDate)}`
      : sessionTitle
  ).toUpperCase();

  return (
    <View>
      {offline ? (
        <OfflineBanner
          style={styles.offlineBanner}
          message={`You're offline. Your workout is saved on your phone and sends to ${coachFirst} when you're back.`}
        />
      ) : null}
      <View style={styles.head}>
        <Text variant="label" tone="ink">
          {eyebrow}
        </Text>
        <Text variant="largeTitle" accessibilityRole="header">
          Workout done
        </Text>
      </View>

      {coachLogState(execution) === "edited" ? (
        <View style={styles.banner}>
          <CoachLogBanner
            state="edited"
            execution={execution}
            coachName={coachName}
            timeZone={timeZone}
          />
        </View>
      ) : null}

      <View style={styles.stats}>
        <Stat label="Duration" value={minutes != null ? String(minutes) : "—"} unit={minutes != null ? " min" : ""} />
        <Stat
          label="Volume"
          value={volume != null ? formatNumber(volume) : "—"}
          unit={volume != null ? " kg" : ""}
        />
        <Stat label="Sets" value={String(counts.done)} unit={` / ${counts.total}`} />
      </View>

      {changeRows.length > 0 ? (
        <>
          <Text variant="label" tone="ink2" style={styles.section}>
            {`CHANGED FROM THE PLAN · ${coachFirst.toUpperCase()} SEES THIS`}
          </Text>
          <View style={styles.card}>
            {changeRows.map((row, index) => (
              <View
                key={row.id}
                style={[styles.changeRow, index > 0 ? styles.changeBorder : null]}
              >
                <View
                  style={[
                    styles.changeTile,
                    row.skipped ? styles.changeTileNeutral : styles.changeTileUp,
                  ]}
                >
                  {row.skipped ? (
                    <SkipForward size={18} color={theme.colors.ink2} strokeWidth={1.75} />
                  ) : (
                    <ArrowUpRight size={18} color={theme.colors.done} strokeWidth={2} />
                  )}
                </View>
                <View style={styles.flex}>
                  <Text variant="body">{row.exerciseName}</Text>
                  <Text variant="subhead" tone="ink2">
                    {row.detail}
                  </Text>
                </View>
                <Text variant="body" tone={row.skipped ? "ink3" : "ink"}>
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.rpeBlock}>
        {windowClosed ? (
          <View
            accessible
            accessibilityLabel={`Your rating ${confirmedRpe != null ? `${confirmedRpe} of 10` : "not rated"}`}
          >
            <Text variant="label" tone="ink2">
              YOUR RATING
            </Text>
            <Text variant="body">
              {confirmedRpe != null ? `${confirmedRpe} of 10` : "Not rated"}
            </Text>
          </View>
        ) : (
          <RpePicker
            value={rpe}
            onChange={onPickRpe}
            required={execution.requireSessionRpe}
            coachFirst={coachFirst}
          />
        )}
        {windowClosed ? null : (
          <NoteField value={note} onChange={onChangeNote} coachFirst={coachFirst} />
        )}
        <RatingLine rating={rating} onRetry={onRetry} />
      </View>
    </View>
  );
}

/** The note for the coach (W-17a2, W-17c2): multiline, counter near the limit. */
function NoteField({
  value,
  onChange,
  coachFirst,
}: {
  value: string;
  onChange: (next: string) => void;
  coachFirst: string;
}) {
  const styles = useStyles();
  const nearLimit = value.length >= WORKOUT_SESSION_NOTE_MAX_LENGTH - 50;
  return (
    <View style={styles.noteWrap}>
      <Field
        label={`Note for ${coachFirst}`}
        testID="workout-note-input"
        multiline
        value={value}
        onChangeText={onChange}
        maxLength={WORKOUT_SESSION_NOTE_MAX_LENGTH}
        placeholder={`Anything ${coachFirst} should know?`}
        hint={nearLimit ? `${value.length} / ${WORKOUT_SESSION_NOTE_MAX_LENGTH}` : undefined}
      />
    </View>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label} ${value}${unit}`}>
      <Text variant="subhead" tone="ink2">
        {label}
      </Text>
      <Text variant="numberLg">
        {value}
        {unit ? (
          <Text variant="body" tone="ink2">
            {unit}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

/** Sent-time line: "Tue 24 Nov, 7:10 pm". */
function weekdayInstant(iso: string, timeZone: string): string {
  const day = localDateInTimezone(timeZone, new Date(iso));
  return `${weekdayShort(timeZone, day)} ${formatInstant(iso, timeZone)}`;
}

function ViewBody({
  execution,
  assignment,
  coachFirst,
  timeZone,
  rpe,
  note,
  rating,
  windowClosed,
  now,
  onBack,
  onSave,
  onRetry,
  draftStore,
}: {
  execution: WorkoutExecution;
  assignment: WorkoutAssignment | null;
  coachFirst: string;
  timeZone: string;
  rpe: number | null;
  note: string;
  rating: RatingNotice;
  windowClosed: boolean;
  now?: Date;
  onBack: () => void;
  onSave: (next: { rpe: number | null; note: string }) => void;
  onRetry: (change: FeedbackChange) => void;
  draftStore: FeedbackDraftHandle;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number | null>(rpe);
  const [draftNote, setDraftNote] = useState(note);
  // Z14-37: the sheet's typing is kept until Save or Cancel.
  const sheetTouchedRef = useRef(false);
  const sheetTypedRef = useRef<FeedbackDraft>({ rpe: draft, note: draftNote });
  sheetTypedRef.current = { rpe: draft, note: draftNote };
  function pickInSheet(next: number | null) {
    sheetTouchedRef.current = true;
    setDraft(next);
    draftStore.schedule({ rpe: next, note: sheetTypedRef.current.note });
  }
  function typeInSheet(next: string) {
    sheetTouchedRef.current = true;
    setDraftNote(next);
    draftStore.schedule({ rpe: sheetTypedRef.current.rpe, note: next });
  }
  function closeSheet() {
    draftStore.clear();
    setEditing(false);
  }
  const shownNote = normalizeNote(note);
  const counts = sessionSetCounts(execution);
  const volume = sessionVolumeKg(execution);
  const minutes = durationMinutesFromExecution(execution);
  const changeRows = useMemo(() => planChangeRows(execution), [execution]);
  const sessionTitle = assignment?.workoutDayName ?? "Workout";
  const dateShort =
    assignment?.localDate != null ? formatCivilDateShort(assignment.localDate) : null;
  const eyebrow = (dateShort ? `${sessionTitle} · ${dateShort}` : sessionTitle).toUpperCase();
  const until = execution.feedbackEditableUntil ?? null;
  const editable =
    !windowClosed &&
    until != null &&
    (now ?? new Date()).getTime() < new Date(until).getTime();
  const exerciseCount = execution.exercises.length;
  const sharedLine = execution.completedAt
    ? `Shared ${weekdayInstant(execution.completedAt, timeZone)}`
    : null;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        hitSlop={8}
        style={styles.backBtn}
      >
        <ArrowLeft size={24} color={theme.colors.ink} strokeWidth={1.75} />
      </Pressable>
      <View style={styles.head}>
        <Text variant="label" tone="ink">
          {eyebrow}
        </Text>
        <Text variant="largeTitle" accessibilityRole="header">
          {sessionTitle}
        </Text>
      </View>
      <View style={styles.sentRow}>
        <View style={styles.sentChip}>
          <Check size={18} color={theme.colors.done} strokeWidth={2} />
          <Text variant="subhead" style={styles.sentText}>
            {`Sent to ${coachFirst === "your coach" ? "your coach" : coachFirst}`}
          </Text>
        </View>
        {sharedLine ? (
          <Text variant="subhead" tone="ink2" style={styles.flex}>
            {sharedLine}
          </Text>
        ) : null}
      </View>

      <View style={styles.stats}>
        <Stat label="Duration" value={minutes != null ? String(minutes) : "—"} unit={minutes != null ? " min" : ""} />
        <Stat
          label="Volume"
          value={volume != null ? formatNumber(volume) : "—"}
          unit={volume != null ? " kg" : ""}
        />
        <Stat label="Sets" value={String(counts.done)} unit={` / ${counts.total}`} />
      </View>

      {changeRows.length > 0 ? (
        <>
          <Text variant="label" tone="ink2" style={styles.section}>
            {`CHANGED FROM THE PLAN · ${coachFirst.toUpperCase()} SEES THIS`}
          </Text>
          <View style={styles.card}>
            {changeRows.map((row, index) => (
              <View
                key={row.id}
                style={[styles.changeRow, index > 0 ? styles.changeBorder : null]}
              >
                <View
                  style={[
                    styles.changeTile,
                    row.skipped ? styles.changeTileNeutral : styles.changeTileUp,
                  ]}
                >
                  {row.skipped ? (
                    <SkipForward size={18} color={theme.colors.ink2} strokeWidth={1.75} />
                  ) : (
                    <ArrowUpRight size={18} color={theme.colors.done} strokeWidth={2} />
                  )}
                </View>
                <View style={styles.flex}>
                  <Text variant="body">{row.exerciseName}</Text>
                  <Text variant="subhead" tone="ink2">
                    {row.detail}
                  </Text>
                </View>
                <Text variant="body" tone={row.skipped ? "ink3" : "ink"}>
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <>
          <Text variant="label" tone="ink2" style={styles.section}>
            DONE AS PLANNED
          </Text>
          <View style={[styles.card, styles.changeRow]}>
            <View style={[styles.changeTile, styles.changeTileUp]}>
              <Check size={18} color={theme.colors.done} strokeWidth={2} />
            </View>
            <View style={styles.flex}>
              <Text variant="body">
                {exerciseCount > 0 ? `All ${exerciseCount} exercises` : "All exercises"}
              </Text>
              <Text variant="subhead" tone="ink2">
                {`No changes from ${coachFirst === "your coach" ? "your coach" : coachFirst}\u2019s plan`}
              </Text>
            </View>
          </View>
        </>
      )}

      <View style={styles.ratingHead}>
        <Text variant="label" tone="ink2">
          YOUR RATING AND NOTE
        </Text>
        {editable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change your rating and note"
            onPress={() => {
              setDraft(rpe);
              setDraftNote(note);
              sheetTouchedRef.current = false;
              setEditing(true);
              // What was typed before a cover or a restart comes back.
              void draftStore.read().then((saved) => {
                if (!saved || sheetTouchedRef.current) return;
                setDraft(saved.rpe);
                setDraftNote(saved.note);
              });
            }}
            hitSlop={12}
            style={styles.changeHit}
          >
            <Text variant="bodyStrong">Change</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.card}>
        <View style={styles.changeRow}>
          <View style={[styles.changeTile, styles.changeTileNeutral]}>
            {rpe != null ? (
              <Text variant="headline">{String(rpe)}</Text>
            ) : (
              <Minus size={18} color={theme.colors.ink2} strokeWidth={2} />
            )}
          </View>
          <View style={styles.flex}>
            <Text variant="subhead" tone="ink2">
              How hard was it
            </Text>
            <Text variant="body">{rpe != null ? `${rpe} of 10` : "Not rated"}</Text>
          </View>
        </View>
        {shownNote != null ? (
          <View style={[styles.noteRead, styles.changeBorder]}>
            <Text variant="subhead" tone="ink2">
              {`Note for ${coachFirst}`}
            </Text>
            <Text variant="body" selectable testID="workout-note-text">
              {shownNote}
            </Text>
          </View>
        ) : null}
      </View>
      <Text variant="subhead" tone="ink2" style={styles.viewHint}>
        {editable && until
          ? `You can change this until ${weekdayInstant(until, timeZone)}.`
          : RATING_NOTE_WINDOW_CLOSED_MESSAGE}
      </Text>
      <RatingLine rating={rating} onRetry={onRetry} />

      <BottomSheet
        visible={editing}
        title="Your rating and note"
        subtitle={`${sessionTitle}${dateShort ? ` · ${dateShort}` : ""} · ${coachFirst === "your coach" ? "Your coach" : coachFirst} sees the change`}
        onDismiss={closeSheet}
      >
        <RpePicker
          value={draft}
          onChange={pickInSheet}
          required={execution.requireSessionRpe}
          coachFirst={coachFirst}
        />
        <NoteField value={draftNote} onChange={typeInSheet} coachFirst={coachFirst} />
        <View style={styles.sheetActions}>
          <Button
            label="Save"
            testID="workout-note-save"
            disabled={execution.requireSessionRpe && draft == null}
            onPress={() => {
              onSave({ rpe: draft, note: draftNote });
              closeSheet();
            }}
          />
          <Button label="Cancel" variant="secondary" onPress={closeSheet} />
        </View>
      </BottomSheet>
    </View>
  );
}

function SharedBody({
  rating,
  onRetry,
  execution,
  assignment,
  coachFirst,
  weekAssignments,
  weekStart,
  timeZone,
  offline,
}: {
  rating: RatingNotice;
  onRetry: (change: FeedbackChange) => void;
  execution: WorkoutExecution;
  assignment: WorkoutAssignment | null;
  coachFirst: string;
  weekAssignments: readonly WorkoutAssignment[];
  weekStart: string;
  timeZone: string;
  offline: boolean;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const week = useMemo(() => {
    const patched = withFinishedExecution(
      // The finished workout's own assignment counts even when the list the
      // tab had did not include it.
      assignment && !weekAssignments.some((item) => item.id === assignment.id)
        ? [...weekAssignments, assignment]
        : weekAssignments,
      execution,
    );
    return weekWorkoutSummary(patched, startOfWeekMonday(weekStart));
  }, [assignment, execution, weekAssignments, weekStart]);
  const doneDates = new Set(
    week.days.filter((day) => day.done).map((day) => day.localDate),
  );
  const finishedDate = assignment?.localDate ?? null;
  const savedAt = execution.completedAt
    ? formatClockTime(execution.completedAt, timeZone)
    : null;
  const coachLabel = coachFirst === "your coach" ? "Your coach" : coachFirst;

  return (
    <View style={styles.sharedWrap}>
      <View style={styles.bigCheck}>
        <Check size={40} color={theme.colors.done} strokeWidth={2.5} />
      </View>
      <Text variant="largeTitle" style={styles.center} accessibilityRole="header">
        {offline ? "Saved on your phone" : `Shared with ${coachFirst}`}
      </Text>
      <Text variant="body" tone="ink2" style={[styles.center, styles.sharedBody]}>
        {offline
          ? `It goes to ${coachFirst} when you’re back online.`
          : `${savedAt ? `Saved at ${savedAt}. ` : ""}${coachLabel} will see your sets.`}
      </Text>
      <RatingLine rating={rating} onRetry={onRetry} />

      {week.total > 0 ? (
        <View style={[styles.card, styles.weekCard]}>
          <View style={styles.weekHead}>
            <Text variant="headline">This week</Text>
            <Text variant="body" tone="ink2">
              {`${week.completed} of ${week.total} done`}
            </Text>
          </View>
          <View style={styles.weekRow}>
            {week.dates.map((date) => {
              const done = doneDates.has(date);
              return (
                <View
                  key={date}
                  style={styles.weekDay}
                  accessible
                  accessibilityLabel={`${weekdayShort(timeZone, date)}, ${done ? "done" : "not done"}`}
                >
                  <Text variant="subhead" tone="ink3">
                    {weekdayShort(timeZone, date).charAt(0)}
                  </Text>
                  <View
                    style={[
                      styles.weekDot,
                      done ? styles.weekDotDone : null,
                      done && date === finishedDate ? styles.weekDotNew : null,
                    ]}
                  >
                    {done ? (
                      <Check size={18} color={theme.colors.onBrand} strokeWidth={2.5} />
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  head: {
    gap: t.spacing.xs,
    paddingTop: t.spacing.xl,
  },
  banner: {
    marginTop: t.spacing.lg,
  },
  stats: {
    flexDirection: "row",
    gap: t.spacing.md,
    marginTop: t.spacing.xl,
    paddingHorizontal: t.spacing.xs,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  section: {
    marginBottom: t.spacing.sm,
    marginTop: t.spacing.xl,
    paddingHorizontal: t.spacing.xs,
  },
  card: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: t.radii.card,
    borderWidth: 1,
  },
  changeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: t.spacing.md,
    minHeight: 64,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.md,
  },
  changeBorder: {
    borderTopColor: t.colors.line,
    borderTopWidth: 1,
  },
  changeTile: {
    alignItems: "center",
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  changeTileUp: {
    backgroundColor: t.colors.doneTint,
  },
  changeTileNeutral: {
    backgroundColor: t.colors.fill,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  offlineBanner: {
    marginTop: t.spacing.md,
  },
  rpeBlock: {
    marginTop: t.spacing.xl,
    paddingBottom: t.spacing.lg,
  },
  footerHint: {
    paddingTop: t.spacing.sm,
    textAlign: "center",
  },
  backBtn: {
    alignItems: "flex-start",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
    paddingTop: t.spacing.sm,
  },
  sentRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: t.spacing.sm,
    marginTop: t.spacing.sm,
  },
  sentChip: {
    alignItems: "center",
    backgroundColor: t.colors.doneTint,
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: t.spacing.md,
    paddingVertical: 6,
  },
  sentText: { color: t.colors.done, fontWeight: "600" },
  ratingHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: t.spacing.sm,
    marginTop: t.spacing.xl,
    paddingHorizontal: t.spacing.xs,
  },
  changeHit: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
  },
  noteWrap: {
    marginTop: t.spacing.lg,
  },
  noteRead: {
    gap: 2,
    paddingBottom: t.spacing.md,
    paddingHorizontal: t.spacing.md,
    paddingTop: t.spacing.md,
  },
  ratingNotice: {
    gap: t.spacing.xs,
    marginTop: t.spacing.md,
    paddingHorizontal: t.spacing.xs,
  },
  viewHint: {
    marginTop: t.spacing.md,
    paddingHorizontal: t.spacing.xs,
  },
  sheetActions: {
    gap: t.spacing.sm,
    marginTop: t.spacing.lg,
  },
  // The Screen's footer bar already draws the edge and the background.
  abar: {
    paddingTop: t.spacing.xs,
  },
  footerBtn: {
    minHeight: 56,
  },
  sharedWrap: {
    alignItems: "stretch",
    paddingTop: 48,
  },
  bigCheck: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: t.colors.doneTint,
    borderRadius: 48,
    height: 96,
    justifyContent: "center",
    marginBottom: t.spacing.xl,
    width: 96,
  },
  center: {
    textAlign: "center",
  },
  sharedBody: {
    marginTop: t.spacing.sm,
  },
  weekCard: {
    marginTop: t.spacing.xxl,
    padding: 20,
  },
  weekHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: t.spacing.lg,
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  weekDay: {
    alignItems: "center",
    gap: t.spacing.sm,
  },
  weekDot: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  weekDotDone: {
    backgroundColor: t.colors.done,
  },
  weekDotNew: {
    borderColor: t.colors.doneTint,
    borderWidth: 3,
  },
}));
