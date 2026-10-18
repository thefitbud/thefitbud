import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import { formatCivilDate, labelFor } from "@fitbud/core";
import type { WorkoutAssignment } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";

type Props = {
  assignmentId: string;
  onBack: () => void;
  onAskCoach?: (assignment: WorkoutAssignment) => void;
};

export function WorkoutOverviewScreen({
  assignmentId,
  onBack,
  onAskCoach,
}: Props) {
  const { api } = useAuth();
  const [assignment, setAssignment] = useState<WorkoutAssignment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const value = await api.getWorkoutAssignment(assignmentId);
      setAssignment(value);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load workout.",
      );
    }
  }, [api, assignmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen title="Workout overview" subtitle={assignment?.workoutDayName ?? "…"}>
      {error ? <ErrorBanner message={error} /> : null}
      {assignment ? (
        <View style={styles.stack}>
          <Text style={styles.meta}>
            {formatCivilDate(assignment.localDate)} ·{" "}
            {labelFor("workout_assignment_status", assignment.status)}
          </Text>
          {assignment.workoutDay.exercises.map((exercise) => (
            <View key={exercise.id} style={styles.row}>
              <Text style={styles.name}>{exercise.name}</Text>
              <Text style={styles.sets}>
                {exercise.setTargets.length} sets
              </Text>
            </View>
          ))}
          {onAskCoach ? (
            <PrimaryButton
              label="Ask coach on WhatsApp"
              variant="secondary"
              onPress={() => onAskCoach(assignment)}
            />
          ) : null}
        </View>
      ) : null}
      <PrimaryButton label="Back" variant="ghost" onPress={onBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  meta: {
    color: colors.midGrey,
    fontSize: 14,
  },
  row: {
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: spacing.md,
  },
  name: {
    color: colors.deepNavy,
    fontWeight: "600",
  },
  sets: {
    color: colors.midGrey,
    fontSize: 13,
    marginTop: 2,
  },
});
