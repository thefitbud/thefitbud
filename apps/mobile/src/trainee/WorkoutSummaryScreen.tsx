import { useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { ArrowLeft, ArrowUpRight, Check, Minus, Send, SkipForward } from "lucide-react-native";
import { Text } from "../components/Text";
import type { WorkoutAssignment, WorkoutExecution } from "@fitbud/contracts";
import { formatClockTime, formatInstant, formatNumber } from "@fitbud/core";
import { Button } from "../components/Button";
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
 * Z14-12 (D-W14-10, D-W14-20): after a finish the summary asks how hard it
 * was (W-17a2, optional unless the plan requires it, W-17a3) and queues the
 * rating through `onSaveRpe` (the `workout.feedback` outbox mutation).
 * `mode="view"` is the read-only summary of a finished workout (W-17c) with
 * one Done; while the API's `feedbackEditableUntil` is in the future one
 * "Change" opens the rating sheet (W-17c2), afterwards the group is plain
 * text (W-17c3). The note is not built: `workout_executions` has no note
 * column and no new migration is allowed (D-W14-18), so nothing here asks for
 * or implies a saved note. Records are not computed either.
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
  onSaveRpe,
  now,
}: {
  execution: WorkoutExecution;
  assignment?: WorkoutAssignment | null;
  onDone: () => void;
  /** `view`: the read-only summary of a finished workout (W-17c). */
  mode?: "after_finish" | "view";
  /** Queues the rating change; `recordVersion` is the version to send. */
  onSaveRpe?: (rpe: number | null, recordVersion: number) => void;
  /** The clock for the 48 h rule (tests). */
  now?: Date;
  coachName?: string;
  weekAssignments?: readonly WorkoutAssignment[];
  weekStart?: string;
  timeZone?: string;
  today?: string;
  offline?: boolean;
}) {
  const [shared, setShared] = useState(false);
  const [rpe, setRpe] = useState<number | null>(execution.sessionRpe);
  // After a finish the server's version is one past the phone's (the finish
  // bumps it); each queued change takes the next one (decide-and-note).
  const versionRef = useRef(
    execution.recordVersion + (mode === "after_finish" ? 1 : 0),
  );
  function commitRpe(next: number | null) {
    setRpe(next);
    onSaveRpe?.(next, versionRef.current);
    versionRef.current += 1;
  }
  const trimmedCoach = coachName.trim() || "Your coach";
  const coachFirst =
    trimmedCoach.toLowerCase() === "your coach"
      ? "your coach"
      : trimmedCoach.split(/\s+/)[0]!;

  const rpeBlocked = execution.requireSessionRpe && rpe == null;
  const footer =
    mode === "view" || shared ? (
      <SummaryFooter label="Done" onPress={onDone} />
    ) : (
      <SummaryFooter
        label={`Save and share with ${coachFirst}`}
        share
        disabled={rpeBlocked}
        hint={rpeBlocked ? "Pick how hard it was to save." : undefined}
        onPress={() => setShared(true)}
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
          now={now}
          onBack={onDone}
          onSaveRpe={commitRpe}
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
          onPickRpe={commitRpe}
        />
      )}
    </Screen>
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
  onPickRpe,
}: {
  execution: WorkoutExecution;
  assignment: WorkoutAssignment | null;
  coachName: string;
  coachFirst: string;
  timeZone: string;
  offline: boolean;
  rpe: number | null;
  onPickRpe: (next: number | null) => void;
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
        <RpePicker
          value={rpe}
          onChange={onPickRpe}
          required={execution.requireSessionRpe}
          coachFirst={coachFirst}
        />
      </View>
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
  now,
  onBack,
  onSaveRpe,
}: {
  execution: WorkoutExecution;
  assignment: WorkoutAssignment | null;
  coachFirst: string;
  timeZone: string;
  rpe: number | null;
  now?: Date;
  onBack: () => void;
  onSaveRpe: (next: number | null) => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number | null>(rpe);
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
    until != null && (now ?? new Date()).getTime() < new Date(until).getTime();
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
          YOUR RATING
        </Text>
        {editable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change your rating"
            onPress={() => {
              setDraft(rpe);
              setEditing(true);
            }}
            hitSlop={12}
            style={styles.changeHit}
          >
            <Text variant="bodyStrong">Change</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.card, styles.changeRow]}>
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
      <Text variant="subhead" tone="ink2" style={styles.viewHint}>
        {editable && until
          ? `You can change this until ${weekdayInstant(until, timeZone)}.`
          : "Ratings can be changed for 48 hours after a workout."}
      </Text>

      <BottomSheet
        visible={editing}
        title="Your rating"
        subtitle={`${sessionTitle}${dateShort ? ` · ${dateShort}` : ""} · ${coachFirst === "your coach" ? "Your coach" : coachFirst} sees the change`}
        onDismiss={() => setEditing(false)}
      >
        <RpePicker
          value={draft}
          onChange={setDraft}
          required={execution.requireSessionRpe}
          coachFirst={coachFirst}
        />
        <View style={styles.sheetActions}>
          <Button
            label="Save"
            disabled={execution.requireSessionRpe && draft == null}
            onPress={() => {
              if (draft !== rpe) onSaveRpe(draft);
              setEditing(false);
            }}
          />
          <Button label="Cancel" variant="secondary" onPress={() => setEditing(false)} />
        </View>
      </BottomSheet>
    </View>
  );
}

function SharedBody({
  execution,
  assignment,
  coachFirst,
  weekAssignments,
  weekStart,
  timeZone,
  offline,
}: {
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
