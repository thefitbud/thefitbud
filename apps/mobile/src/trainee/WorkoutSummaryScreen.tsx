import { StyleSheet, Text, View } from "react-native";
import type { WorkoutExecution } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";

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
  const started = Date.parse(execution.startedAt);
  const completed = execution.completedAt
    ? Date.parse(execution.completedAt)
    : Date.now();
  const durationMinutes = Math.max(
    1,
    Math.round((completed - started) / 60_000),
  );

  return (
    <Screen
      title="Workout Summary"
      subtitle="Session captured for your trainer. No gamification."
    >
      <View style={styles.card}>
        <Text style={styles.label}>Outcome</Text>
        <Text style={styles.value}>
          {execution.status.replace(/_/g, " ")}
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Duration</Text>
        <Text style={styles.value}>{durationMinutes} min</Text>
      </View>
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
    fontSize: 20,
    fontWeight: "700",
    textTransform: "capitalize",
  },
});
