import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import { labelFor } from "@fitbud/core";
import type { WorkoutAssignment } from "@fitbud/contracts";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { StatusChip } from "../components/StatusChip";
import { weekdayShort } from "../lib/dates";
import { estimateDurationMinutesFromDay } from "./workoutDuration";

const TARGET = 44;

type Props = {
  assignmentId: string;
  onBack: () => void;
  onAskCoach?: (assignment: WorkoutAssignment) => void;
};

function humanStatusLabel(status: WorkoutAssignment["status"]): string {
  return labelFor("workout_assignment_status", status);
}

function exercisePreviewLine(exercise: WorkoutAssignment["workoutDay"]["exercises"][number]): string {
  const sets = exercise.setTargets.length;
  const first = exercise.setTargets[0];
  const reps = first?.reps != null ? `${first.reps}` : null;
  const load = first?.loadLabel?.trim() || null;
  const parts = [`${sets}×${reps ?? "?"}`];
  if (load) parts.push(load);
  return parts.join(" · ");
}

export function WorkoutOverviewScreen({
  assignmentId,
  onBack,
  onAskCoach,
}: Props) {
  const { api, me } = useAuth();
  const [assignment, setAssignment] = useState<WorkoutAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const timeZone = me?.timezone ?? "UTC";

  const load = useCallback(async () => {
    setError(null);
    try {
      const value = await api.getWorkoutAssignment(assignmentId);
      setAssignment(value);
      setOffline(false);
    } catch (err) {
      setOffline(true);
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't load workout. Pull to try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, assignmentId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const duration =
    assignment != null
      ? estimateDurationMinutesFromDay(assignment.workoutDay)
      : null;
  const dayLabel =
    assignment != null
      ? weekdayShort(timeZone, assignment.localDate)
      : null;

  return (
    <Screen
      chrome="app"
      title="Workout"
      subtitle={assignment?.workoutDayName}
      refreshing={refreshing}
      onRefresh={() => {
        void onRefresh();
      }}
    >
      {error ? <ErrorBanner message={error} /> : null}
      {offline ? (
        <Text style={styles.offline}>Saved on phone · Not sent yet</Text>
      ) : null}
      {loading && !assignment ? (
        <Text style={styles.muted}>Loading workout…</Text>
      ) : null}
      {assignment ? (
        <View style={styles.stack}>
          <View style={styles.metaRow}>
            <StatusChip
              kind="workout"
              value={assignment.status}
              label={humanStatusLabel(assignment.status)}
            />
            {dayLabel ? (
              <Text style={styles.meta}>{dayLabel}</Text>
            ) : null}
            {duration != null ? (
              <Text style={styles.meta}>About {duration} min</Text>
            ) : null}
          </View>

          {assignment.workoutDay.instructions?.trim() ? (
            <Text style={styles.note}>{assignment.workoutDay.instructions}</Text>
          ) : null}

          <Text style={styles.sectionTitle} accessibilityRole="header">
            Exercises
          </Text>
          {assignment.workoutDay.exercises.map((exercise) => (
            <View key={exercise.id} style={styles.row}>
              <Text style={styles.name}>{exercise.name}</Text>
              <Text style={styles.sets}>{exercisePreviewLine(exercise)}</Text>
            </View>
          ))}

          {onAskCoach ? (
            <PrimaryButton
              label="Ask coach"
              variant="secondary"
              onPress={() => onAskCoach(assignment)}
              style={styles.ask}
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
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  meta: {
    color: colors.midGrey,
    fontSize: 14,
  },
  note: {
    color: colors.darkGrey,
    fontSize: 15,
    lineHeight: 22,
  },
  sectionTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "700",
  },
  row: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    gap: 2,
    minHeight: TARGET,
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
  ask: {
    marginTop: spacing.sm,
  },
  muted: {
    color: colors.midGrey,
    fontSize: 15,
  },
  offline: {
    color: colors.midGrey,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
});
