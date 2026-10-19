import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import type {
  Checkin,
  CoachingRelationship,
  EffectivePlanResponse,
  MealAssignment,
  WorkoutAssignment,
} from "@fitbud/contracts";
import {
  formatClockTime,
  formatKcal,
  formatNumber,
  labelFor,
} from "@fitbud/core";
import {
  NutritionRings,
  WeeklyConsistency,
  colors,
  radii,
  spacing,
} from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
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
import { confirmMealAssignment, MealSyncError } from "./mealActions";
import {
  canLogMealOnDate,
  cleanFoodLabel,
  mealKcalFromDayTotals,
  mealLockCopy,
} from "./mealHelpers";
import { subscribeAll } from "./dataCache";
import {
  buildNutritionRings,
  isMealLoggedForCount,
  mealsLoggedSummary,
  nutrientsFromMealPrescription,
} from "./nutrition";
import { nextUp, nextUpEyebrow } from "./nextUp";
import { pickTodayCheckin } from "./pickTodayCheckin";
import {
  scheduledAssignments,
  sortMealsByTime,
} from "./scheduledAssignments";
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

function mealItemLine(meal: MealAssignment): string {
  const items = meal.prescription.items
    .slice(0, 3)
    .map((item) => {
      if ("label" in item && typeof item.label === "string" && item.label) {
        return cleanFoodLabel(item.label);
      }
      if ("name" in item && typeof item.name === "string" && item.name) {
        return cleanFoodLabel(item.name);
      }
      return null;
    })
    .filter(Boolean);
  return items.join(" · ");
}

function exerciseCountLabel(count: number): string {
  return count === 1 ? "1 exercise" : `${count} exercises`;
}

/** Spec decision 22: Home heading is "Today" (no time-of-day greeting). */
function hasLivePlan(plan: EffectivePlanResponse | null): boolean {
  return plan?.version != null;
}

function mealStatusChip(
  meal: MealAssignment,
  nextId: string | undefined,
): { label: string; tone: "neutral" | "positive" | "attention" } {
  if (isMealLoggedForCount(meal.status)) {
    return { label: "Logged", tone: "positive" };
  }
  if (meal.id === nextId) {
    return { label: "Up next", tone: "attention" };
  }
  return { label: "Later", tone: "neutral" };
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
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offlineHint, setOfflineHint] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [weekModel, setWeekModel] = useState<Awaited<
    ReturnType<typeof s1.getMeWeek>
  > | null>(null);
  const [dayTotals, setDayTotals] = useState<Awaited<
    ReturnType<typeof s1.getMeDay>
  > | null>(null);
  const [coachNotes, setCoachNotes] = useState<CoachNote[]>([]);
  // Trainee listExceptions is 403 — late-log gate uses a positive sentinel.
  const unresolvedExceptions = 1;
  const [mealActingId, setMealActingId] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const coachName =
    relationship.trainerDisplayName?.split(/\s+/)[0] ?? "Your coach";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const weekStart = startOfWeekMonday(selectedDate);
      const nextDay = addDays(selectedDate, 1);
      const [workouts, mealList, week, day, notes, checkins] =
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
          api.listCheckins(relationship.id).catch(() => ({ items: [] as Checkin[] })),
        ]);
      setWeekModel(week);
      setDayTotals(day);
      setCoachNotes(notes.items.slice(0, 2));
      setWorkout(
        scheduledAssignments(workouts.items).find(
          (item) => item.localDate === selectedDate,
        ) ?? null,
      );
      setMeals(sortMealsByTime(scheduledAssignments(mealList.items)));
      setCheckin(pickTodayCheckin(checkins.items));
      setOfflineHint(false);
    } catch {
      setError("Couldn't refresh · pull to try again.");
      setOfflineHint(true);
      setWorkout(null);
      setMeals([]);
    } finally {
      setLoading(false);
    }
  }, [api, relationship.id, selectedDate, s1]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  useEffect(() => {
    return subscribeAll(() => {
      setRefreshNonce((value) => value + 1);
    });
  }, []);

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

  const hero = useMemo(
    () =>
      isToday
        ? nextUp({ meals, workout, checkin })
        : null,
    [checkin, isToday, meals, workout],
  );

  const nextOpenMeal = meals.find(
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

  async function handleConfirmMeal(meal: MealAssignment) {
    setMealActingId(meal.id);
    setError(null);
    try {
      await confirmMealAssignment(
        api,
        sync,
        relationship.id,
        meal,
        coachName,
      );
      await load();
    } catch (err) {
      setError(
        err instanceof MealSyncError
          ? err.message
          : "Couldn't save that meal. Try again when you're online.",
      );
    } finally {
      setMealActingId(null);
    }
  }

  const planReady = hasLivePlan(effectivePlan);
  const allDone =
    isToday &&
    planReady &&
    meals.length > 0 &&
    meals.every((m) => isMealLoggedForCount(m.status)) &&
    (!workout ||
      workout.status === "completed" ||
      workout.status === "skipped");

  const workoutExercises = workout?.workoutDay.exercises ?? [];
  const workoutMins = Math.max(20, workoutExercises.length * 8);

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
        {isToday ? (
          <View style={styles.greet}>
            <Text style={styles.greetTitle} accessibilityRole="header">
              {allDone ? "That's everything for today." : "Today"}
            </Text>
            <Text style={styles.greetSub}>
              {allDone
                ? "Nicely done."
                : planReady
                  ? "Here's your day."
                  : `${coachName} is preparing your plan.`}
            </Text>
          </View>
        ) : null}

        <TraineeDateNavigator
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
        />

        {offlineHint ? (
          <Text style={styles.offlineHint}>Saved on phone · showing last sync</Text>
        ) : null}
        {error ? <ErrorBanner message={error} /> : null}

        {!planReady && !loading ? (
          <View
            style={styles.card}
            accessibilityLabel="Your coach is preparing your plan"
          >
            <Text style={styles.cardTitle}>
              Your coach is preparing your plan
            </Text>
            <Text style={styles.body}>
              {coachName} will publish your meals and workouts soon. Pull down
              to check for updates.
            </Text>
          </View>
        ) : null}

        {!isToday && !isFuture && lateLoggableCount > 0 ? (
          <Text style={styles.lateBanner}>
            You can still log {lateLoggableCount} item
            {lateLoggableCount === 1 ? "" : "s"} from this day.
          </Text>
        ) : null}

        {loading ? (
          <View style={styles.card} accessibilityLabel="Loading today">
            <Text style={styles.body}>Loading your day…</Text>
          </View>
        ) : null}

        {planReady && hero && !loading ? (
          <View style={styles.hero} accessibilityLabel={nextUpEyebrow(hero)}>
            <Text style={styles.heroEyebrow}>{nextUpEyebrow(hero)}</Text>
            {hero.kind === "meal" ? (
              <>
                <Text style={styles.heroTitle}>
                  {hero.meal.mealName}
                  {" · "}
                  {formatClockTime(hero.meal.windowStartsAt, timeZone)}
                </Text>
                {mealItemLine(hero.meal) ? (
                  <Text style={styles.heroItems}>{mealItemLine(hero.meal)}</Text>
                ) : null}
                {(() => {
                  const macros = nutrientsFromMealPrescription(hero.meal);
                  return (
                    <Text style={styles.heroMacros}>
                      <Text style={styles.heroMacroBold}>
                        {formatNumber(macros.kcal)}
                      </Text>{" "}
                      kcal{"  "}P{" "}
                      <Text style={styles.heroMacroBold}>{macros.protein}</Text> g
                      {"  "}C{" "}
                      <Text style={styles.heroMacroBold}>{macros.carbs}</Text> g
                      {"  "}F{" "}
                      <Text style={styles.heroMacroBold}>{macros.fat}</Text> g
                    </Text>
                  );
                })()}
                {(() => {
                  const lockCopy = mealLockCopy(hero.meal, coachName);
                  if (lockCopy) {
                    return (
                      <Text style={styles.heroItems}>{lockCopy}</Text>
                    );
                  }
                  if (
                    !canLogMealOnDate({
                      selectedDate,
                      today,
                      meal: hero.meal,
                      unresolvedExceptionCount: unresolvedExceptions,
                    })
                  ) {
                    return null;
                  }
                  return (
                    <View style={styles.heroBtns}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Eaten as planned"
                        disabled={mealActingId === hero.meal.id}
                        onPress={() => {
                          void handleConfirmMeal(hero.meal);
                        }}
                        style={styles.heroPrimary}
                      >
                        <Text style={styles.heroPrimaryLabel}>
                          {mealActingId === hero.meal.id
                            ? "Saving…"
                            : "Eaten as planned"}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Something different"
                        onPress={() =>
                          onOpenOverlay({
                            screen: "something_different",
                            assignmentId: hero.meal.id,
                          })
                        }
                        style={styles.heroSecondary}
                      >
                        <Text style={styles.heroSecondaryLabel}>
                          Something different
                        </Text>
                      </Pressable>
                    </View>
                  );
                })()}
              </>
            ) : null}
            {hero.kind === "workout" ? (
              <>
                <Text style={styles.heroTitle}>
                  {hero.workout.workoutDayName}
                </Text>
                <Text style={styles.heroItems}>
                  {exerciseCountLabel(hero.workout.workoutDay.exercises.length)}{" "}
                  · about {workoutMins} min
                </Text>
                <View style={styles.heroBtns}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      hero.workout.status === "in_progress" ||
                      hero.workout.status === "paused"
                        ? "Continue workout"
                        : "Start workout"
                    }
                    onPress={onStartWorkout}
                    style={styles.heroPrimary}
                  >
                    <Text style={styles.heroPrimaryLabel}>
                      {hero.workout.status === "in_progress" ||
                      hero.workout.status === "paused"
                        ? "Continue workout"
                        : "Start workout"}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}
            {hero.kind === "checkin" ? (
              <>
                <Text style={styles.heroTitle}>Weekly check-in</Text>
                <Text style={styles.heroItems}>
                  Due · keep your coach in the loop
                </Text>
                <View style={styles.heroBtns}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Start check-in"
                    onPress={() => onOpenCheckin(hero.checkin)}
                    style={styles.heroPrimary}
                  >
                    <Text style={styles.heroPrimaryLabel}>Start check-in</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        <View style={styles.secHead}>
          <Text style={styles.secTitle}>Today&apos;s workout</Text>
          {workout ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="See workout"
              onPress={() =>
                onOpenOverlay({
                  screen: "workout_overview",
                  assignmentId: workout.id,
                })
              }
              style={styles.secLink}
            >
              <Text style={styles.secLinkText}>See workout ›</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.card}>
          {workout ? (
            <>
              <View style={styles.woTop}>
                <StatusChip
                  label={`${labelFor("workout_assignment_status", workout.status)} · ${formatClockTime(workout.windowStartsAt, timeZone)}`}
                  tone={workoutTone(workout.status)}
                />
              </View>
              <Text style={styles.cardTitle}>{workout.workoutDayName}</Text>
              <Text style={styles.body}>
                {exerciseCountLabel(workoutExercises.length)} · about{" "}
                {workoutMins} min
              </Text>
              {workoutExercises.slice(0, 3).map((ex) => (
                <Text key={ex.id} style={styles.exRow}>
                  {ex.name}
                </Text>
              ))}
              {workoutExercises.length > 3 ? (
                <Text style={styles.body}>
                  + {workoutExercises.length - 3} more exercises
                </Text>
              ) : null}
              {isToday &&
              workout.status !== "completed" &&
              workout.status !== "skipped" ? (
                <PrimaryButton
                  label={
                    workout.status === "in_progress" ||
                    workout.status === "paused"
                      ? "Continue workout"
                      : "Start workout"
                  }
                  onPress={onStartWorkout}
                />
              ) : null}
            </>
          ) : (
            <Text style={styles.cardTitle}>
              Rest day. Recovery is part of the plan.
            </Text>
          )}
        </View>

        {planReady ? (
          <>
            <View style={styles.secHead}>
              <Text style={styles.secTitle}>Nutrition</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open diet"
                onPress={onOpenDiet}
                style={styles.secLink}
              >
                <Text style={styles.secLinkText}>Diet ›</Text>
              </Pressable>
            </View>
            <View style={styles.card}>
              {Platform.OS === "web" ? (
                <WebNutritionSummary data={rings} />
              ) : (
                <NutritionRings data={rings} />
              )}
              {rings.some((r) => r.unknown) ? (
                <Text style={styles.footnote}>
                  Some foods have no nutrition data. Totals show ≥ when unknown.
                </Text>
              ) : null}
              <View style={styles.mealsHead}>
                <Text style={styles.mealsLabel}>Meals</Text>
                <Text style={styles.mealsCount}>
                  {mealsLoggedSummary(meals)}
                </Text>
              </View>
              {meals.length === 0 && !loading ? (
                <Text style={styles.body}>No meals planned today.</Text>
              ) : (
                meals.map((meal) => {
                  const chip = mealStatusChip(meal, nextOpenMeal?.id);
                  const kcal = mealKcalFromDayTotals(
                    meal,
                    dayTotals?.totals.perMeal,
                  );
                  const lockCopy = mealLockCopy(meal, coachName);
                  return (
                    <View key={meal.id} style={styles.mealRow}>
                      <View style={styles.mealMain}>
                        <Text style={styles.mealName}>
                          {cleanFoodLabel(meal.mealName)}
                        </Text>
                        <Text style={styles.mealMeta}>
                          {formatClockTime(meal.windowStartsAt, timeZone)}
                          {mealItemLine(meal)
                            ? ` · ${mealItemLine(meal)}`
                            : ""}
                          {lockCopy ? ` · ${lockCopy}` : ""}
                        </Text>
                      </View>
                      <View style={styles.mealRight}>
                        <Text style={styles.mealKcal}>
                          {kcal != null
                            ? formatKcal(kcal, false).replace(" kcal", "") +
                              " kcal"
                            : "—"}
                        </Text>
                        <StatusChip
                          label={lockCopy ? "Closed" : chip.label}
                          tone={lockCopy ? "neutral" : chip.tone}
                        />
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </>
        ) : null}

        <StepsCard />

        {weekModel ? (
          <>
            <View style={styles.secHead}>
              <Text style={styles.secTitle}>This week</Text>
            </View>
            <View style={styles.card}>
              <WeeklyConsistency
                workoutCompleted={weekModel.workouts.completed}
                workoutAssigned={weekModel.workouts.assigned}
                mealsLogged={weekModel.meals.logged}
                mealsAssigned={weekModel.meals.assigned}
                days={weekModel.days}
                encouragement={
                  isToday
                    ? "Yesterday got away from you? Today's a fresh start."
                    : null
                }
              />
            </View>
          </>
        ) : null}

        {coachNotes.length > 0 ? (
          <>
            <View style={styles.secHead}>
              <Text style={styles.secTitle}>From your coach</Text>
            </View>
            <View style={styles.card}>
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
          </>
        ) : null}

        <TodayCheckinCard
          relationship={relationship}
          onOpen={onOpenCheckin}
        />

        {effectivePlan?.version ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View meal plan"
            onPress={() => onOpenOverlay({ screen: "meal_plan" })}
          >
            <Text style={styles.planLink}>View assigned meal plan ›</Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  greet: {
    gap: 2,
    marginBottom: spacing.xs,
  },
  greetTitle: {
    color: colors.deepNavy,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  greetSub: {
    color: colors.midGrey,
    fontSize: 16,
    lineHeight: 22,
  },
  offlineHint: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "600",
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
    backgroundColor: colors.deepNavy,
    borderRadius: 22,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  heroEyebrow: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 13,
    color: colors.white,
    fontSize: 13,
    fontWeight: "600",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroTitle: {
    color: colors.white,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginTop: spacing.xs,
  },
  heroItems: {
    color: "rgba(255,255,255,0.84)",
    fontSize: 16,
    lineHeight: 24,
  },
  heroMacros: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    marginTop: spacing.xs,
  },
  heroMacroBold: {
    color: colors.white,
    fontWeight: "700",
  },
  heroBtns: {
    gap: 4,
    marginTop: spacing.md,
  },
  heroPrimary: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.control,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  heroPrimaryLabel: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "700",
  },
  heroSecondary: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
  heroSecondaryLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  secHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  secTitle: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
  },
  secLink: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  secLinkText: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
  card: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  cardTitle: {
    color: colors.deepNavy,
    fontSize: 20,
    fontWeight: "700",
  },
  body: {
    color: colors.midGrey,
    fontSize: 15,
    lineHeight: 22,
  },
  footnote: {
    color: colors.midGrey,
    fontSize: 12,
    lineHeight: 16,
  },
  woTop: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  exRow: {
    color: colors.darkGrey,
    fontSize: 15,
    lineHeight: 22,
  },
  mealsHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  mealsLabel: {
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "700",
  },
  mealsCount: {
    color: colors.midGrey,
    fontSize: 12,
    fontWeight: "500",
  },
  mealRow: {
    alignItems: "flex-start",
    borderTopColor: colors.lightGrey,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  mealMain: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  mealName: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
  mealMeta: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  mealRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  mealKcal: {
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "700",
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
  planLink: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
    paddingVertical: spacing.md,
    textAlign: "center",
  },
});
