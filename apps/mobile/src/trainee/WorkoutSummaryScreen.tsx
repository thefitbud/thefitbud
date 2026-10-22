import { useMemo, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Check, TrendingDown, X } from "lucide-react-native";
import { Text } from "../components/Text";
import type { WorkoutAssignment, WorkoutExecution } from "@fitbud/contracts";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { weekDatesFrom } from "../lib/dates";
import { durationMinutesFromExecution } from "./workoutDuration";
import {
  coachInitials,
  formatCivilDateShort,
  planChangeRows,
  weekDotStatus,
} from "./workoutDisplay";

const TARGET = 44;

export function WorkoutSummaryScreen({
  execution,
  assignment = null,
  onDone,
  coachName = "Your coach",
  weekAssignments = [],
  weekStart,
  today = "",
  weekCompleted,
  weekTotal,
  offline = false,
}: {
  execution: WorkoutExecution;
  assignment?: WorkoutAssignment | null;
  onDone: () => void;
  coachName?: string;
  weekAssignments?: WorkoutAssignment[];
  weekStart?: string;
  timeZone?: string;
  today?: string;
  weekCompleted?: number;
  weekTotal?: number;
  offline?: boolean;
}) {
  const [note, setNote] = useState("");

  const exercisesDone = execution.exercises.filter((exercise) =>
    exercise.sets.every((set) => set.status !== "pending"),
  ).length;
  const exercisesTotal = execution.exercises.length;

  const setsDone = execution.exercises.reduce(
    (count, exercise) =>
      count +
      exercise.sets.filter(
        (set) => set.status === "completed" || set.status === "modified",
      ).length,
    0,
  );
  const setsSkipped = execution.exercises.reduce(
    (count, exercise) =>
      count + exercise.sets.filter((set) => set.status === "skipped").length,
    0,
  );
  const setsTotal = execution.exercises.reduce(
    (count, exercise) => count + exercise.sets.length,
    0,
  );

  const changeRows = useMemo(() => planChangeRows(execution), [execution]);

  const durationMinutes = durationMinutesFromExecution(execution);
  const trimmedCoach = coachName.trim() || "Your coach";
  const coachLabel =
    trimmedCoach.toLowerCase() === "your coach"
      ? "Your coach"
      : trimmedCoach.split(/\s+/)[0] || "Your coach";

  const sessionTitle = assignment?.workoutDayName ?? "Workout";
  const sessionDate =
    assignment?.localDate != null
      ? formatCivilDateShort(assignment.localDate)
      : null;
  const eyebrow =
    sessionDate != null ? `${sessionTitle} · ${sessionDate}` : sessionTitle;

  const showWeek =
    weekCompleted != null &&
    weekTotal != null &&
    weekTotal > 0 &&
    Number.isFinite(weekCompleted) &&
    Number.isFinite(weekTotal);

  const weekDates = weekStart ? weekDatesFrom(weekStart) : [];
  const byDate = useMemo(() => {
    const map = new Map<string, WorkoutAssignment>();
    for (const item of weekAssignments) {
      if (!map.has(item.localDate)) map.set(item.localDate, item);
    }
    return map;
  }, [weekAssignments]);

  const rpe = execution.sessionRpe;
  const rpeLabel =
    rpe != null ? `${rpe}` : execution.requireSessionRpe ? "—" : "—";

  const footer = (
    <View style={styles.abar}>
      <PrimaryButton
        label="Done"
        onPress={onDone}
        style={styles.doneBtn}
        variant="primary"
      />
    </View>
  );

  return (
    <Screen
      chrome="app"
      title="Workout done"
      showHeader={false}
      footer={footer}
    >
      <View style={styles.head}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.h1} accessibilityRole="header">
          Workout done
        </Text>
        <View style={styles.coral} />
      </View>

      <View style={styles.stat4}>
        <View style={styles.statTile}>
          <Text style={styles.statB}>
            {durationMinutes ?? "—"}
            {durationMinutes != null ? (
              <Text style={styles.statSmall}> min</Text>
            ) : null}
          </Text>
          <Text style={styles.statS}>Duration</Text>
        </View>
        <View style={styles.statTile}>
          <Text style={styles.statB}>
            {exercisesDone}
            <Text style={styles.statSmall}> of {exercisesTotal}</Text>
          </Text>
          <Text style={styles.statS}>Exercises</Text>
        </View>
        <View style={styles.statTile}>
          <Text style={styles.statB}>
            {setsDone}
            <Text style={styles.statSmall}> of {setsTotal}</Text>
          </Text>
          <Text style={styles.statS}>
            Sets{setsSkipped > 0 ? ` · ${setsSkipped} skipped` : ""}
          </Text>
        </View>
        <View style={styles.statTile}>
          <Text style={styles.statB}>
            {rpeLabel}
            {execution.requireSessionRpe ? (
              <Text style={styles.statSmall}> of 10</Text>
            ) : null}
          </Text>
          <Text style={styles.statS}>How hard it felt</Text>
        </View>
      </View>

      {changeRows.length > 0 ? (
        <>
          <View style={styles.sh}>
            <Text style={styles.shTitle} accessibilityRole="header">
              Changed from the plan
            </Text>
          </View>
          <View style={styles.changeCard}>
            {changeRows.map((row) => (
              <View key={row.id} style={styles.changeRow}>
                <View
                  style={[
                    styles.changeTile,
                    row.skipped ? styles.changeTileNeu : null,
                  ]}
                >
                  {row.skipped ? (
                    <X color={colors.midGrey} size={18} />
                  ) : (
                    <TrendingDown color={colors.indigo} size={18} />
                  )}
                </View>
                <View style={styles.changeTx}>
                  <Text style={styles.changeName}>{row.exerciseName}</Text>
                  <Text style={styles.changeDetail}>{row.detail}</Text>
                </View>
                <Text
                  style={[
                    styles.changeVal,
                    row.skipped ? styles.changeValMuted : null,
                  ]}
                >
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {showWeek && weekDates.length > 0 ? (
        <View style={styles.wkline}>
          <View style={styles.wklineTx}>
            <Text style={styles.wklineTitle}>
              {weekCompleted} of {weekTotal} workouts
            </Text>
            <Text style={styles.wklineSub}>This week</Text>
          </View>
          <View style={styles.dots7}>
            {weekDates.map((date) => {
              const item = byDate.get(date);
              const status = weekDotStatus(date, today, item);
              return (
                <View
                  key={date}
                  style={[
                    styles.dot,
                    status === "done" ? styles.dotDone : null,
                    status === "miss" ? styles.dotMiss : null,
                    status === "rest" ? styles.dotRest : null,
                    status === "future" ? styles.dotFut : null,
                  ]}
                >
                  {status === "done" ? (
                    <Check color={colors.white} size={12} strokeWidth={3} />
                  ) : null}
                  {status === "miss" ? (
                    <X color={colors.coral} size={12} strokeWidth={3} />
                  ) : null}
                  {status === "rest" ? <View style={styles.dotDash} /> : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.seen}>
        <View style={styles.seenAv}>
          <Text style={styles.seenAvText}>
            {coachInitials(
              trimmedCoach.toLowerCase() === "your coach"
                ? "Your Coach"
                : trimmedCoach,
            )}
          </Text>
        </View>
        <Text style={styles.seenText}>{coachLabel} will see this.</Text>
      </View>

      <Text style={styles.noteLbl}>
        Note for {coachLabel} <Text style={styles.noteOpt}>· optional</Text>
      </Text>
      <TextInput
        accessibilityLabel="Note for coach"
        value={note}
        onChangeText={setNote}
        placeholder="How did it feel?"
        placeholderTextColor={colors.midGrey}
        multiline
        style={styles.noteInput}
      />

      {offline ? (
        <Text style={styles.offline}>
          Saved on phone. Will sync when you're online.
        </Text>
      ) : null}

      <View style={styles.footerSpacer} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: {
    paddingHorizontal: 4,
    paddingTop: 10,
  },
  eyebrow: {
    color: colors.midGrey,
    fontSize: 14,
    fontWeight: "600",
  },
  h1: {
    color: colors.deepNavy,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.5,
    lineHeight: 36,
    marginTop: 4,
  },
  coral: {
    backgroundColor: colors.coral,
    borderRadius: 2,
    height: 3,
    marginTop: 10,
    width: 48,
  },
  stat4: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  statTile: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 20,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#0F0C28",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  statB: {
    color: colors.deepNavy,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  statSmall: {
    color: colors.midGrey,
    fontSize: 16,
    fontWeight: "600",
  },
  statS: {
    color: colors.midGrey,
    fontSize: 14,
    fontWeight: "500",
    marginTop: 2,
  },
  sh: {
    marginBottom: 10,
    marginTop: 20,
    paddingHorizontal: 4,
  },
  shTitle: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
  },
  changeCard: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: radii.card,
    borderWidth: 1,
    overflow: "hidden",
  },
  changeRow: {
    alignItems: "center",
    borderTopColor: colors.lightGrey,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  changeTile: {
    alignItems: "center",
    backgroundColor: "#F6F4FF",
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  changeTileNeu: {
    backgroundColor: colors.background,
  },
  changeTx: {
    flex: 1,
    minWidth: 0,
  },
  changeName: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "700",
  },
  changeDetail: {
    color: colors.midGrey,
    fontSize: 13,
    marginTop: 2,
  },
  changeVal: {
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "700",
    maxWidth: 110,
    textAlign: "right",
  },
  changeValMuted: {
    color: colors.midGrey,
    fontWeight: "600",
  },
  wkline: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    marginTop: 12,
    padding: spacing.lg,
  },
  wklineTx: {
    flex: 1,
  },
  wklineTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "700",
  },
  wklineSub: {
    color: colors.midGrey,
    fontSize: 14,
    marginTop: 2,
  },
  dots7: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  dot: {
    alignItems: "center",
    borderRadius: 11,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  dotDone: {
    backgroundColor: colors.deepNavy,
  },
  dotMiss: {
    borderColor: colors.coral,
    borderWidth: 1.5,
  },
  dotRest: {},
  dotFut: {
    borderColor: colors.lightGrey,
    borderWidth: 1.5,
  },
  dotDash: {
    backgroundColor: colors.midGrey,
    borderRadius: 1,
    height: 2,
    width: 8,
  },
  seen: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  seenAv: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  seenAvText: {
    color: colors.indigo,
    fontSize: 11,
    fontWeight: "700",
  },
  seenText: {
    color: colors.darkGrey,
    fontSize: 15,
  },
  noteLbl: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "600",
    marginTop: 16,
  },
  noteOpt: {
    color: colors.midGrey,
    fontWeight: "500",
  },
  noteInput: {
    backgroundColor: colors.background,
    borderColor: colors.lightGrey,
    borderRadius: radii.control,
    borderWidth: 1,
    color: colors.nearBlack,
    fontSize: 16,
    marginTop: 8,
    minHeight: TARGET * 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlignVertical: "top",
  },
  offline: {
    color: colors.midGrey,
    fontSize: 14,
    marginTop: spacing.md,
  },
  footerSpacer: {
    height: 80,
  },
  abar: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderTopColor: colors.lightGrey,
    borderTopWidth: 1,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  doneBtn: {
    minHeight: 56,
  },
});
