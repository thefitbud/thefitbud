import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Text } from "../components/Text";
import type { WorkoutExecution } from "@fitbud/contracts";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { durationMinutesFromExecution } from "./workoutDuration";

const TARGET = 44;

export function WorkoutSummaryScreen({
  execution,
  onDone,
  coachName = "Your coach",
  weekCompleted,
  weekTotal,
  offline = false,
}: {
  execution: WorkoutExecution;
  onDone: () => void;
  coachName?: string;
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

  const modifiedLines: string[] = [];
  for (const exercise of execution.exercises) {
    for (const set of exercise.sets) {
      if (set.status !== "modified") continue;
      const from = set.prescribedLoadLabel?.trim() || "—";
      const to = set.actualLoadLabel?.trim() || "—";
      if (from !== to) {
        modifiedLines.push(`${exercise.name}: ${from} → ${to}`);
      } else if (
        set.prescribedReps != null &&
        set.actualReps != null &&
        set.prescribedReps !== set.actualReps
      ) {
        modifiedLines.push(
          `${exercise.name}: ${set.prescribedReps} → ${set.actualReps} reps`,
        );
      }
    }
  }

  const durationMinutes = durationMinutesFromExecution(execution);
  const coachLabel = coachName.trim().split(/\s+/)[0] || "Your coach";
  const showWeek =
    weekCompleted != null &&
    weekTotal != null &&
    weekTotal > 0 &&
    Number.isFinite(weekCompleted) &&
    Number.isFinite(weekTotal);

  return (
    <Screen chrome="app" title="Workout done" showHeader>
      <View style={styles.accent} accessibilityElementsHidden />
      <View style={styles.card}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Recap
        </Text>
        {durationMinutes != null ? (
          <Text style={styles.line}>{durationMinutes} min</Text>
        ) : null}
        <Text style={styles.line}>
          {exercisesDone} of {exercisesTotal} exercises
        </Text>
        <Text style={styles.line}>
          {setsDone} of {setsTotal} sets
          {setsSkipped > 0 ? ` · ${setsSkipped} skipped` : ""}
        </Text>
        {modifiedLines.length > 0 ? (
          <View style={styles.modifiedBlock}>
            <Text style={styles.modifiedLabel}>Modified</Text>
            {modifiedLines.map((line) => (
              <Text key={line} style={styles.modifiedLine}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      {showWeek ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            This week
          </Text>
          <Text style={styles.line}>
            {weekCompleted} of {weekTotal} workouts
          </Text>
        </View>
      ) : null}

      <Text style={styles.coachLine}>{coachLabel} will see this.</Text>

      <View style={styles.card}>
        <Text style={styles.noteLabel}>Note for coach (optional)</Text>
        <TextInput
          accessibilityLabel="Note for coach"
          value={note}
          onChangeText={setNote}
          placeholder="How did it feel?"
          placeholderTextColor={colors.midGrey}
          multiline
          style={styles.noteInput}
        />
      </View>

      {offline ? (
        <Text style={styles.offline}>
          Saved on phone. Will sync when you're online.
        </Text>
      ) : null}

      <PrimaryButton label="Done" onPress={onDone} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  accent: {
    backgroundColor: colors.coral,
    borderRadius: 2,
    height: 3,
    marginBottom: spacing.lg,
    width: 48,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  sectionTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "700",
  },
  line: {
    color: colors.darkGrey,
    fontSize: 16,
    lineHeight: 22,
  },
  modifiedBlock: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  modifiedLabel: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "600",
  },
  modifiedLine: {
    color: colors.darkGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  coachLine: {
    color: colors.midGrey,
    fontSize: 15,
    marginBottom: spacing.md,
  },
  noteLabel: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "600",
  },
  noteInput: {
    backgroundColor: colors.background,
    borderColor: colors.lightGrey,
    borderRadius: radii.control,
    borderWidth: 1,
    color: colors.nearBlack,
    fontSize: 16,
    minHeight: TARGET * 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlignVertical: "top",
  },
  offline: {
    color: colors.midGrey,
    fontSize: 14,
    marginBottom: spacing.md,
  },
});
