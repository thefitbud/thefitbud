import { StyleSheet, Text, View } from "react-native";
import type { WorkoutExecution } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { enumLabel } from "@fitbud/core";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { durationMinutesFromExecution } from "./workoutDuration";

export function WorkoutSummaryScreen({
  execution,
  onDone,
}: {
  execution: WorkoutExecution;
  onDone: () => void;
}) {
  const setsCompleted = execution.exercises.reduce(
    (count, exercise) =>
      count +
      exercise.sets.filter(
        (set) => set.status === "completed" || set.status === "modified",
      ).length,
    0,
  );
  const setsTotal = execution.exercises.reduce(
    (count, exercise) => count + exercise.sets.length,
    0,
  );
  const durationMinutes = durationMinutesFromExecution(execution);

  return (
    <Screen title="Workout Summary" subtitle="Session captured for your coach.">
      <View style={styles.card}>
        <Text style={styles.label}>Outcome</Text>
        <Text style={styles.value}>{enumLabel(execution.status)}</Text>
      </View>
      {durationMinutes != null ? (
        <View style={styles.card}>
          <Text style={styles.label}>Duration</Text>
          <Text style={styles.value}>{durationMinutes} min</Text>
        </View>
      ) : null}
      <View style={styles.card}>
        <Text style={styles.label}>Sets completed</Text>
        <Text style={styles.value}>
          {setsCompleted}/{setsTotal}
        </Text>
      </View>
      {execution.sessionRpe != null ? (
        <View style={styles.card}>
          <Text style={styles.label}>Session RPE</Text>
          <Text style={styles.value}>{execution.sessionRpe}</Text>
        </View>
      ) : null}
      <PrimaryButton label="Done" onPress={onDone} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.lightGrey,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  label: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "500",
  },
  value: {
    color: colors.deepNavy,
    fontSize: 18,
    fontWeight: "600",
  },
});
