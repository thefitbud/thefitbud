import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type {
  Checkin,
  CoachingRelationship,
  EffectivePlanResponse,
  MealAssignment,
  WeekDayState,
  WorkoutAssignment,
} from "@fitbud/contracts";
import {
  DateNavigator,
  NutritionRings,
  WeeklyConsistency,
  colors,
  radii,
  spacing,
  type DateNavigatorDay,
} from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { StatusChip } from "../components/StatusChip";
import {
  addDays,
  dayOfMonth,
  formatHeadingDate,
  localDateInTimezone,
  startOfWeekMonday,
  weekDatesFrom,
  weekdayShort,
} from "../lib/dates";
import { stage1Api } from "../lib/stage1Api";
import type { TraineeOverlayOpener } from "../navigation/TraineeOverlay";
import { TodayCheckinCard } from "./CheckinScreen";
import { buildNutritionRings } from "./nutrition";
import { scheduledAssignments } from "./scheduledAssignments";

function workoutTone(
  status: WorkoutAssignment["status"],
): "neutral" | "positive" | "attention" | "warning" {
  if (status === "completed" || status === "modified") return "positive";
  if (status === "in_progress" || status === "paused") return "attention";
  if (status === "missed" || status === "skipped") return "warning";
  return "neutral";
}

function mapWeekState(state: WeekDayState): DateNavigatorDay["state"] {
  switch (state) {
    case "done":
      return "done";
    case "partial":
      return "partial";
    case "missed":
      return "open";
    case "rest":
      return "rest";
    case "future":
      return "future";
    default:
      return "open";
  }
}

export function TodayTab({
  relationship,
  effectivePlan,
  selectedDate,
  onSelectDate,
  onOpenWorkout,
  onOpenDiet,
  onOpenCheckin,
  onRefreshPlan,
  onOpenOverlay,
}: {
  relationship: CoachingRelationship;
  effectivePlan: EffectivePlanResponse | null;
  selectedDate: string;
  onSelectDate: (localDate: string) => void;
  onOpenWorkout: () => void;
  onOpenDiet: () => void;
  onOpenCheckin: (checkin: Checkin) => void;
  onRefreshPlan: () => void;
  onOpenOverlay: TraineeOverlayOpener;
}) {
  const { api, me } = useAuth();
  const s1 = stage1Api(api);
  const timeZone = me?.timezone ?? "UTC";
  const today = useMemo(() => localDateInTimezone(timeZone), [timeZone]);
  const isToday = selectedDate === today;
  const isFuture = selectedDate > today;

  const [workout, setWorkout] = useState<WorkoutAssignment | null>(null);
  const [meals, setMeals] = useState<MealAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekModel, setWeekModel] = useState<Awaited<
    ReturnType<typeof s1.getMeWeek>
  > | null>(null);

  const weekStart = useMemo(
    () => startOfWeekMonday(selectedDate),
    [selectedDate],
  );

  const navigatorDays = useMemo((): DateNavigatorDay[] => {
    const dates = weekDatesFrom(weekStart);
    const byDate = new Map(
      (weekModel?.days ?? []).map((day) => [day.date, day.state]),
    );
    return dates.map((localDate) => ({
      localDate,
      weekdayLabel: weekdayShort(timeZone, localDate),
      dayLabel: dayOfMonth(timeZone, localDate),
      state: mapWeekState(
        byDate.get(localDate) ?? (localDate > today ? "future" : "missed"),
      ),
    }));
  }, [weekModel?.days, weekStart, timeZone, today]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rangeEnd = addDays(selectedDate, 1);
      const [workouts, mealList, week, day] = await Promise.all([
        api.listWorkoutAssignments(relationship.id, {
          fromDate: selectedDate,
          toDate: rangeEnd,
        }),
        api.listMealAssignments(relationship.id, {
          fromDate: selectedDate,
          toDate: selectedDate,
        }),
        s1.getMeWeek(weekStart).catch(() => null),
        s1.getMeDay(selectedDate).catch(() => null),
      ]);
      setWeekModel(week);
      setDayTotals(day);
      setWorkout(
        scheduledAssignments(workouts.items).find(
          (item) => item.localDate === selectedDate,
        ) ?? null,
      );
      setMeals(scheduledAssignments(mealList.items));
    } catch {
      setWorkout(null);
      setMeals([]);
    } finally {
      setLoading(false);
    }
  }, [api, relationship.id, selectedDate, s1, weekStart]);

  const [dayTotals, setDayTotals] = useState<Awaited<
    ReturnType<typeof s1.getMeDay>
  > | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const rings = useMemo(
    () => buildNutritionRings(meals, dayTotals?.totals ?? null),
    [meals, dayTotals],
  );

  const nextMeal = meals.find(
    (meal) => meal.status === "pending" || meal.status === "overdue",
  );

  const loggedMeals = meals.filter(
    (meal) =>
      meal.status === "confirmed" ||
      meal.status === "modified" ||
      meal.status === "logged_later" ||
      meal.status === "skipped",
  ).length;

  return (
    <Screen chrome="app" title="Today" showHeader={false}>
      <View style={styles.stack}>
        {!isToday ? (
          <Text style={styles.previewBanner}>
            {isFuture
              ? `Preview · ${formatHeadingDate(timeZone, selectedDate)}`
              : `Viewing ${selectedDate} · read-only`}
          </Text>
        ) : null}

        <DateNavigator
          days={navigatorDays}
          selectedDate={selectedDate}
          todayDate={today}
          onSelect={onSelectDate}
          onToday={() => onSelectDate(today)}
        />

        <View style={styles.hero}>
          <Text style={styles.kicker}>Next action</Text>
          {loading ? (
            <Text style={styles.body}>Loading…</Text>
          ) : workout ? (
            <>
              <Text style={styles.heroTitle}>{workout.workoutDayName}</Text>
              <StatusChip
                label={workout.status.replace(/_/g, " ")}
                tone={workoutTone(workout.status)}
              />
              <PrimaryButton
                label={
                  workout.status === "in_progress" || workout.status === "paused"
                    ? "Continue workout"
                    : "Start workout"
                }
                disabled={!isToday || isFuture}
                onPress={onOpenWorkout}
              />
              <PrimaryButton
                label="See workout"
                variant="secondary"
                onPress={() =>
                  onOpenOverlay({
                    screen: "workout_overview",
                    assignmentId: workout.id,
                  })
                }
              />
            </>
          ) : (
            <Text style={styles.heroTitle}>
              {isToday ? "No workout today" : "Rest or no session"}
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nutrition</Text>
          <NutritionRings data={rings} />
          {nextMeal && isToday ? (
            <View style={styles.nextMeal}>
              <Text style={styles.nextMealTitle}>{nextMeal.mealName}</Text>
              <PrimaryButton
                label="Eaten as planned"
                onPress={onOpenDiet}
              />
              <PrimaryButton
                label="Something different"
                variant="secondary"
                onPress={() =>
                  onOpenOverlay({
                    screen: "something_different",
                    assignmentId: nextMeal.id,
                  })
                }
              />
            </View>
          ) : loggedMeals === meals.length && meals.length > 0 ? (
            <Text style={styles.body}>All meals logged for this day.</Text>
          ) : null}
        </View>

        {weekModel ? (
          <View style={styles.card}>
            <WeeklyConsistency
              workoutCompleted={weekModel.workouts.completed}
              workoutAssigned={weekModel.workouts.assigned}
              mealsLogged={weekModel.meals.logged}
              mealsAssigned={weekModel.meals.assigned}
              days={weekModel.days}
              encouragement={
                isToday ? "Yesterday got away from you? Today's a fresh start." : null
              }
            />
          </View>
        ) : null}

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
          <PrimaryButton
            label="Open diet"
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
              ? "Your coach's published plan is active."
              : "No effective plan yet."}
          </Text>
          <PrimaryButton
            label="View meal plan"
            variant="secondary"
            onPress={() => onOpenOverlay({ screen: "meal_plan" })}
          />
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
  previewBanner: {
    color: colors.indigo,
    fontSize: 14,
    fontWeight: "600",
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
  nextMeal: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  nextMealTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
});
