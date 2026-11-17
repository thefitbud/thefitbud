import { useMemo, useState } from "react";
import { View } from "react-native";
import { ArrowUpRight, Check, Send, SkipForward } from "lucide-react-native";
import { Text } from "../components/Text";
import type { WorkoutAssignment, WorkoutExecution } from "@fitbud/contracts";
import { formatClockTime, formatNumber } from "@fitbud/core";
import { Button } from "../components/Button";
import { Screen } from "../components/Screen";
import { startOfWeekMonday, weekdayShort } from "../lib/dates";
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
 * to the confirmation; it sends nothing new. The mock's RPE picker, note
 * field and record card have no backend after a finish (no trainee endpoint
 * takes an RPE or a note on a finished execution; nothing computes records),
 * so the RPE shows only as recorded at the finish and the other two are left
 * out (recorded in the PR; the old note field was silently discarded).
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
}: {
  execution: WorkoutExecution;
  assignment?: WorkoutAssignment | null;
  onDone: () => void;
  coachName?: string;
  weekAssignments?: readonly WorkoutAssignment[];
  weekStart?: string;
  timeZone?: string;
  today?: string;
  offline?: boolean;
}) {
  const [shared, setShared] = useState(false);
  const trimmedCoach = coachName.trim() || "Your coach";
  const coachFirst =
    trimmedCoach.toLowerCase() === "your coach"
      ? "your coach"
      : trimmedCoach.split(/\s+/)[0]!;

  const footer = shared ? (
    <SummaryFooter label="Done" onPress={onDone} />
  ) : (
    <SummaryFooter
      label={`Save and share with ${coachFirst}`}
      share
      onPress={() => setShared(true)}
    />
  );

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
        />
      )}
    </Screen>
  );
}

function SummaryFooter({
  label,
  share = false,
  onPress,
}: {
  label: string;
  share?: boolean;
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
        onPress={onPress}
        style={styles.footerBtn}
      />
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
}: {
  execution: WorkoutExecution;
  assignment: WorkoutAssignment | null;
  coachName: string;
  coachFirst: string;
  timeZone: string;
  offline: boolean;
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

      {execution.sessionRpe != null ? (
        <View style={styles.rpeRow}>
          <Text variant="label" tone="ink2">
            HOW HARD IT FELT
          </Text>
          <Text variant="bodyStrong">{`${execution.sessionRpe} of 10`}</Text>
        </View>
      ) : null}

      {offline ? (
        <Text variant="subhead" tone="ink3" style={styles.offline}>
          Saved on phone. Will sync when you&apos;re online.
        </Text>
      ) : null}
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
  rpeRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: t.spacing.xl,
    paddingHorizontal: t.spacing.xs,
  },
  offline: {
    marginTop: t.spacing.lg,
  },
  abar: {
    backgroundColor: t.colors.bg,
    borderTopColor: t.colors.line,
    borderTopWidth: 1,
    paddingBottom: t.spacing.xl,
    paddingHorizontal: t.spacing.lg,
    paddingTop: t.spacing.md,
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
