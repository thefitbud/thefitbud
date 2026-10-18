import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import type {
  Checkin,
  CoachingRelationship,
  EffectivePlanResponse,
  MealAssignment,
  WorkoutAssignment,
} from "@fitbud/contracts";
import { labelFor } from "@fitbud/core";
import {
  NutritionRings,
  WeeklyConsistency,
  colors,
  radii,
  spacing,
} from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { StatusChip } from "../components/StatusChip";
import { formatInstant } from "@fitbud/core";
import {
  addDays,
  localDateInTimezone,
  startOfWeekMonday,
} from "../lib/dates";
import { stage1Api } from "../lib/stage1Api";
import type { TraineeOverlayOpener } from "../navigation/TraineeOverlay";
import { useSyncEngine } from "../sync/SyncProvider";
import { TodayCheckinCard } from "./CheckinScreen";
import { TraineeDateNavigator } from "./TraineeDateNavigator";
import { confirmMealAssignment } from "./mealActions";
import { canLogMealOnDate, mealKcalFromDayTotals } from "./mealHelpers";
import { buildNutritionRings } from "./nutrition";
import { scheduledAssignments } from "./scheduledAssignments";
import { StepsCard } from "./steps/StepsCard";
import { WebNutritionSummary } from "./web/WebTraineeChrome";

function workoutTone(
  status: WorkoutAssignment["status"],
): "neutral" | "positive" | "attention" | "warning" {
  if (status === "completed" || status === "modified") return "positive";
  if (status === "in_progress" || status === "paused") return "attention";
  if (status === "missed" || status === "skipped") return "warning";
  return "neutral";
}

type CoachNote = Awaited<
  ReturnType<ReturnType<typeof stage1Api>["listMeCoachNotes"]>
>["items"][number];

export function TodayTab({
  relationship,
  effectivePlan,
  selectedDate,
  onSelectDate,
  onStartWorkout,
  onOpenDiet,
  onOpenCheckin,
  onRefreshPlan,
  onOpenOverlay,
}: {
  relationship: CoachingRelationship;
  effectivePlan: EffectivePlanResponse | null;
  selectedDate: string;
  onSelectDate: (localDate: string) => void;
  onStartWorkout: () => void;
  onOpenDiet: () => void;
  onOpenCheckin: (checkin: Checkin) => void;
  onRefreshPlan: () => void;
  onOpenOverlay: TraineeOverlayOpener;
}) {
  const { api, me } = useAuth();
  const sync = useSyncEngine();
  const s1 = stage1Api(api);
  const timeZone = me?.timezone ?? "UTC";
  const today = useMemo(() => localDateInTimezone(timeZone), [timeZone]);
  const isToday = selectedDate === today;
  const isFuture = selectedDate > today;

  const [workout, setWorkout] = useState<WorkoutAssignment | null>(null);
  const [meals, setMeals] = useState<MealAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weekModel, setWeekModel] = useState<Awaited<
    ReturnType<typeof s1.getMeWeek>
  > | null>(null);
  const [dayTotals, setDayTotals] = useState<Awaited<
    ReturnType<typeof s1.getMeDay>
  > | null>(null);
  const [coachNotes, setCoachNotes] = useState<CoachNote[]>([]);
  const [unresolvedExceptions, setUnresolvedExceptions] = useState(0);
  const [mealActingId, setMealActingId] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const weekStart = startOfWeekMonday(selectedDate);
      const nextDay = addDays(selectedDate, 1);
      const [workouts, mealList, week, day, notes, exceptions] =
        await Promise.all([
          api.listWorkoutAssignments(relationship.id, {
            fromDate: selectedDate,
            toDate: nextDay,
          }),
          api.listMealAssignments(relationship.id, {
            fromDate: selectedDate,
            toDate: selectedDate,
          }),
          s1.getMeWeek(weekStart).catch(() => null),
          s1.getMeDay(selectedDate).catch(() => null),
          s1.listMeCoachNotes().catch(() => ({ items: [] as CoachNote[] })),
          api.listExceptions(relationship.id).catch(() => ({ items: [] })),
        ]);
      setWeekModel(week);
      setDayTotals(day);
      setCoachNotes(notes.items.slice(0, 2));
      setUnresolvedExceptions(
        exceptions.items.filter(
          (item) =>
            item.status === "detected" ||
            item.status === "active" ||
            item.status === "acknowledged",
        ).length,
      );
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
  }, [api, relationship.id, selectedDate, s1]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    onRefreshPlan();
    setRefreshNonce((value) => value + 1);
    await load();
    setRefreshing(false);
  }, [load, onRefreshPlan]);

  const rings = useMemo(
    () => buildNutritionRings(meals, dayTotals?.totals ?? null),
    [meals, dayTotals],
  );

  const nextMeal = meals.find(
    (meal) => meal.status === "pending" || meal.status === "overdue",
  );

  const lateLoggableCount = meals.filter((meal) =>
    canLogMealOnDate({
      selectedDate,
      today,
      meal,
      unresolvedExceptionCount: unresolvedExceptions,
    }),
  ).length;

  const loggedMeals = meals.filter(
    (meal) =>
      meal.status === "confirmed" ||
      meal.status === "modified" ||
      meal.status === "logged_later" ||
      meal.status === "skipped",
  ).length;

  async function handleConfirmMeal(meal: MealAssignment) {
    setMealActingId(meal.id);
    try {
      await confirmMealAssignment(api, sync, relationship.id, meal);
      await load();
    } finally {
      setMealActingId(null);
    }
  }

  const canLogNextMeal =
    nextMeal &&
    canLogMealOnDate({
      selectedDate,
      today,
      meal: nextMeal,
      unresolvedExceptionCount: unresolvedExceptions,
    });

  return (
    <Screen
      chrome="app"
      title="Today"
      showHeader={false}
      refreshing={refreshing}
      onRefresh={() => {
        void onRefresh();
      }}
    >
      <View style={styles.stack}>
        <TraineeDateNavigator
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
        />

        {!isToday && !isFuture && lateLoggableCount > 0 ? (
          <Text style={styles.lateBanner}>
            You can still log {lateLoggableCount} item
            {lateLoggableCount === 1 ? "" : "s"} from this day.
          </Text>
        ) : null}

        <View style={styles.hero}>
          <Text style={styles.kicker}>Today's workout</Text>
          {loading ? (
            <Text style={styles.body}>Loading…</Text>
          ) : workout ? (
            <>
              <Text style={styles.heroTitle}>{workout.workoutDayName}</Text>
              <Text style={styles.body}>
                {workout.workoutDay.exercises.length} exercises
              </Text>
              <StatusChip
                label={labelFor("workout_assignment_status", workout.status)}
                tone={workoutTone(workout.status)}
              />
              <PrimaryButton
                label={
                  workout.status === "in_progress" || workout.status === "paused"
                    ? "Continue workout"
                    : "Start workout"
                }
                disabled={!isToday || isFuture}
                onPress={onStartWorkout}
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
              {isToday ? "Rest day" : "Rest or no session"}
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nutrition</Text>
          {Platform.OS === "web" ? (
            <WebNutritionSummary data={rings} />
          ) : (
            <NutritionRings data={rings} />
          )}
          {nextMeal && canLogNextMeal ? (
            <View style={styles.nextMeal}>
              <Text style={styles.nextMealTitle}>
                {nextMeal.mealName}
                {mealKcalFromDayTotals(nextMeal, dayTotals?.totals.perMeal)
                  ? ` · ${mealKcalFromDayTotals(nextMeal, dayTotals?.totals.perMeal)} kcal`
                  : ""}
              </Text>
              <PrimaryButton
                label="Eaten as planned"
                loading={mealActingId === nextMeal.id}
                onPress={() => {
                  void handleConfirmMeal(nextMeal);
                }}
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
          <PrimaryButton
            label="Open diet"
            variant="ghost"
            onPress={onOpenDiet}
          />
        </View>

        <StepsCard />

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

        {coachNotes.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>From your coach</Text>
            {coachNotes.map((note) => (
              <View key={note.id} style={styles.note}>
                <Text style={styles.noteBody}>{note.body}</Text>
                <Text style={styles.noteMeta}>
                  {note.seenAt ? "Read" : "New"} ·{" "}
                  {formatInstant(note.sharedAt ?? note.createdAt, timeZone)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

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
  lateBanner: {
    backgroundColor: colors.paleLavender,
    borderRadius: radii.card,
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "600",
    padding: spacing.md,
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
  note: {
    borderTopColor: colors.lightGrey,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  noteBody: {
    color: colors.darkGrey,
    fontSize: 15,
    lineHeight: 22,
  },
  noteMeta: {
    color: colors.midGrey,
    fontSize: 12,
  },
});
