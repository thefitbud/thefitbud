import { useCallback, useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import type { MealAssignment, WorkoutAssignment } from "@fitbud/contracts";
import { formatCivilDate, formatLocalDate, formatPersonName, labelFor } from "@fitbud/core";
import { ink } from "@fitbud/tokens";
import { Text } from "../../components/Text";
import { useAuth } from "../../auth/AuthProvider";
import { addDays } from "../../lib/dates";
import { M2Group, M2Page, M2Row } from "./m2";

type Props = {
  onBack: () => void;
  relationshipId?: string;
  coachName?: string;
  endedAt?: string | null;
};

type LogRow = {
  id: string;
  label: string;
  hint: string;
};

function civilFromIso(iso: string | null | undefined): string {
  if (!iso) return "Date unknown";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatCivilDate(iso);
  return formatCivilDate(formatLocalDate(new Date(iso), "Asia/Kolkata"));
}

function mealStatus(status: MealAssignment["status"]): string {
  if (status === "confirmed" || status === "logged_later") return "Logged";
  if (status === "skipped") return "Skipped";
  if (status === "modified") return "Changed";
  return labelFor("meal_assignment_status", status);
}

function workoutStatus(status: WorkoutAssignment["status"]): string {
  if (status === "completed") return "Done";
  if (status === "skipped") return "Skipped";
  if (status === "missed") return "Missed";
  return labelFor("workout_assignment_status", status);
}

export function PastCoachingScreen({
  onBack,
  relationshipId,
  coachName = "Your coach",
  endedAt,
}: Props) {
  const { api } = useAuth();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const page = await api.listRelationships({ limit: 50 });
      const ended = page.items.filter((row) => row.status === "ended");
      const focus =
        ended.find((row) => row.id === relationshipId) ?? ended[0] ?? null;
      const endDate = focus?.endedAt
        ? formatLocalDate(new Date(focus.endedAt), "Asia/Kolkata")
        : formatLocalDate(new Date(), "Asia/Kolkata");
      const fromDate = addDays(endDate, -90);
      const logs: LogRow[] = ended.map((item) => ({
        id: `rel-${item.id}`,
        label: formatPersonName(item.trainerDisplayName) || coachName,
        hint: civilFromIso(item.endedAt),
      }));
      if (focus) {
        const [meals, workouts] = await Promise.all([
          api
            .listMealAssignments(focus.id, { fromDate, toDate: endDate })
            .catch(() => ({ items: [] as MealAssignment[] })),
          api
            .listWorkoutAssignments(focus.id, { fromDate, toDate: endDate })
            .catch(() => ({ items: [] as WorkoutAssignment[] })),
        ]);
        for (const meal of meals.items) {
          logs.push({
            id: `meal-${meal.id}`,
            label: meal.mealName,
            hint: `${civilFromIso(meal.localDate)} · ${mealStatus(meal.status)}`,
          });
        }
        for (const workout of workouts.items) {
          logs.push({
            id: `workout-${workout.id}`,
            label: workout.workoutDayName,
            hint: `${civilFromIso(workout.localDate)} · ${workoutStatus(workout.status)}`,
          });
        }
      }
      setRows(logs);
    } catch {
      setError("Could not load past coaching.");
    } finally {
      setLoading(false);
    }
  }, [api, coachName, relationshipId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <M2Page
      title="Past coaching"
      subtitle={
        endedAt
          ? `Logs through ${civilFromIso(endedAt)} stay on your account. Read-only.`
          : "Past relationships stay on your account. Logs are read-only."
      }
      onBack={onBack}
      refreshing={loading}
      onRefresh={() => {
        setLoading(true);
        void load();
      }}
    >
      {error ? <Text style={styles.muted}>{error}</Text> : null}
      {loading ? (
        <Text accessibilityLabel="Loading past coaching" style={styles.muted}>
          Loading…
        </Text>
      ) : null}
      {!loading && rows.length === 0 ? (
        <Text style={styles.muted}>No ended coaching yet.</Text>
      ) : null}
      {rows.length > 0 ? (
        <M2Group>
          {rows.slice(0, 40).map((row) => (
            <M2Row
              key={row.id}
              label={row.label}
              hint={row.hint}
              showChevron={false}
            />
          ))}
        </M2Group>
      ) : null}
    </M2Page>
  );
}

const styles = StyleSheet.create({
  muted: { color: ink[500], fontSize: 15, lineHeight: 21 },
});
