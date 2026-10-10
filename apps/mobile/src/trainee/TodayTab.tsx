import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type {
  Checkin,
  CoachingRelationship,
  EffectivePlanResponse,
  MealAssignment,
  WorkoutAssignment,
} from "@fitbud/contracts";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { StatusChip } from "../components/StatusChip";
import { createIdempotencyKey } from "../lib/idempotency";
import { TodayCheckinCard } from "./CheckinScreen";
import { scheduledAssignments } from "./scheduledAssignments";

function localDateInTimezone(timeZone: string, instant = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

function formatHeadingDate(timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(new Date());
}

function workoutTone(
  status: WorkoutAssignment["status"],
): "neutral" | "positive" | "attention" | "warning" {
  if (status === "completed" || status === "modified") return "positive";
  if (status === "in_progress" || status === "paused") return "attention";
  if (status === "missed" || status === "skipped") return "warning";
  return "neutral";
}

export function TodayTab({
  relationship,
  effectivePlan,
  onOpenWorkout,
  onOpenDiet,
  onOpenCheckin,
  onRefreshPlan,
}: {
  relationship: CoachingRelationship;
  effectivePlan: EffectivePlanResponse | null;
  onOpenWorkout: () => void;
  onOpenDiet: () => void;
  onOpenCheckin: (checkin: Checkin) => void;
  onRefreshPlan: () => void;
}) {
  const { api, me } = useAuth();
  const timeZone = me?.timezone ?? "UTC";
  const today = useMemo(() => localDateInTimezone(timeZone), [timeZone]);
  const [workout, setWorkout] = useState<WorkoutAssignment | null>(null);
  const [meals, setMeals] = useState<MealAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rangeEnd = addDays(today, 1);
      await Promise.allSettled([
        api.generateWorkoutAssignments(
          relationship.id,
          { fromDate: today, toDate: rangeEnd },
          createIdempotencyKey(),
        ),
        api.generateMealAssignments(
          relationship.id,
          { fromDate: today, toDate: today },
          createIdempotencyKey(),
        ),
      ]);
      const [workouts, mealList] = await Promise.all([
        api.listWorkoutAssignments(relationship.id, {
          fromDate: today,
          toDate: rangeEnd,
        }),
        api.listMealAssignments(relationship.id, {
          fromDate: today,
          toDate: today,
        }),
      ]);
      setWorkout(
        scheduledAssignments(workouts.items).find(
          (item) => item.localDate === today,
        ) ?? null,
      );
      setMeals(scheduledAssignments(mealList.items));
    } catch {
      setWorkout(null);
      setMeals([]);
    } finally {
      setLoading(false);
    }
  }, [api, relationship.id, today]);

  useEffect(() => {
    void load();
  }, [load]);

  const loggedMeals = meals.filter(
    (meal) =>
      meal.status === "confirmed" ||
      meal.status === "modified" ||
      meal.status === "logged_later" ||
      meal.status === "skipped",
  ).length;

  return (
    <Screen
      chrome="app"
      title="Today"
      subtitle={formatHeadingDate(timeZone)}
    >
      <View style={styles.stack}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Next action</Text>
          {loading ? (
            <Text style={styles.body}>Loading today’s plan…</Text>
          ) : workout ? (
            <>
              <Text style={styles.heroTitle}>{workout.workoutDayName}</Text>
              <StatusChip
                label={workout.status.replace(/_/g, " ")}
                tone={workoutTone(workout.status)}
              />
              <Text style={styles.body}>
                {workout.workoutDay.exercises.length} exercises from your
                effective plan.
              </Text>
              <PrimaryButton
                label={
                  workout.status === "in_progress" || workout.status === "paused"
                    ? "Continue workout"
                    : "Open workout"
                }
                onPress={onOpenWorkout}
              />
            </>
          ) : (
            <>
              <Text style={styles.heroTitle}>No workout today</Text>
              <Text style={styles.body}>
                When your trainer’s plan places a session on this day, it shows
                up here.
              </Text>
            </>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Diet</Text>
            <StatusChip
              label={
                meals.length === 0
                  ? "None assigned"
                  : `${loggedMeals} of ${meals.length} logged`
              }
              tone={
                meals.length > 0 && loggedMeals === meals.length
                  ? "positive"
                  : "attention"
              }
            />
          </View>
          {meals.slice(0, 3).map((meal) => (
            <Text key={meal.id} style={styles.mealLine}>
              {meal.mealName}
              {meal.prescription.scheduleHint
                ? ` · ${meal.prescription.scheduleHint}`
                : ""}
            </Text>
          ))}
          <PrimaryButton
            label="Open today’s diet"
            variant="secondary"
            onPress={onOpenDiet}
          />
        </View>

        <TodayCheckinCard
          relationship={relationship}
          onOpen={onOpenCheckin}
        />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {effectivePlan?.plan?.title ?? "Coaching plan"}
          </Text>
          <Text style={styles.body}>
            {effectivePlan?.version
              ? `Version ${effectivePlan.version.versionNumber}${
                  effectivePlan.version.effectiveFrom
                    ? ` · effective ${effectivePlan.version.effectiveFrom.slice(0, 10)}`
                    : ""
                }`
              : "No effective plan yet. It appears here when your trainer publishes one."}
          </Text>
          <PrimaryButton
            label="Refresh"
            variant="ghost"
            onPress={() => {
              onRefreshPlan();
              void load();
            }}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.lg,
    paddingTop: spacing.md,
  },
  hero: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    gap: spacing.md,
    padding: spacing.xl,
  },
  kicker: {
    color: colors.indigo,
    fontSize: 13,
    fontWeight: "600",
  },
  heroTitle: {
    color: colors.deepNavy,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  body: {
    color: colors.midGrey,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.deepNavy,
    fontSize: 18,
    fontWeight: "700",
  },
  mealLine: {
    color: colors.darkGrey,
    fontSize: 15,
    lineHeight: 22,
  },
});
