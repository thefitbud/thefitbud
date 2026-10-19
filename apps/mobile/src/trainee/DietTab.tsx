import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type { CoachingRelationship, MealAssignment } from "@fitbud/contracts";
import { formatClockTime, formatKcal, labelFor } from "@fitbud/core";
import { NutritionRings, colors, radii, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { Snackbar } from "../components/Snackbar";
import { StatusChip } from "../components/StatusChip";
import { localDateInTimezone } from "../lib/dates";
import { stage1Api } from "../lib/stage1Api";
import type { TraineeOverlayOpener } from "../navigation/TraineeOverlay";
import { useSyncEngine } from "../sync/SyncProvider";
import { TraineeDateNavigator } from "./TraineeDateNavigator";
import {
  confirmMealAssignment,
  MealSyncError,
  skipMealAssignment,
} from "./mealActions";
import {
  canLogMealOnDate,
  cleanFoodLabel,
  mealKcalFromDayTotals,
  mealLockCopy,
} from "./mealHelpers";
import {
  buildNutritionRings,
  isMealLoggedForCount,
  mealsLoggedSummary,
} from "./nutrition";
import {
  scheduledAssignments,
  sortMealsByTime,
} from "./scheduledAssignments";
import { invalidateRelationshipDayData, subscribeAll } from "./dataCache";
import { WebNutritionSummary } from "./web/WebTraineeChrome";

function statusLabel(status: MealAssignment["status"]): string {
  if (status === "confirmed") return "Logged";
  if (status === "pending") return "Due";
  if (status === "modified") return "Changed";
  if (status === "logged_later") return "Logged late";
  return labelFor("meal_assignment_status", status);
}

function statusTone(
  status: MealAssignment["status"],
): "neutral" | "positive" | "attention" | "warning" {
  if (status === "confirmed" || status === "logged_later") return "positive";
  if (status === "modified") return "attention";
  if (status === "overdue" || status === "skipped") return "warning";
  return "neutral";
}

export function DietTab({
  relationship,
  selectedDate,
  onSelectDate,
  onOpenOverlay,
}: {
  relationship: CoachingRelationship;
  selectedDate: string;
  onSelectDate: (localDate: string) => void;
  onOpenOverlay: TraineeOverlayOpener;
}) {
  const { api, me } = useAuth();
  const s1 = stage1Api(api);
  const sync = useSyncEngine();
  const [assignments, setAssignments] = useState<MealAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [dayTotals, setDayTotals] = useState<Awaited<
    ReturnType<typeof s1.getMeDay>
  > | null>(null);
  // Late logging still needs a positive count; trainee listExceptions is 403.
  const unresolvedExceptions = 1;
  const [skippedUndo, setSkippedUndo] = useState<{
    assignmentId: string;
    mealName: string;
  } | null>(null);
  const coachName =
    relationship.trainerDisplayName?.split(/\s+/)[0] ?? "Your coach";

  const timeZone = me?.timezone ?? "UTC";
  const today = useMemo(() => localDateInTimezone(timeZone), [timeZone]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [listed, day] = await Promise.all([
        api.listMealAssignments(relationship.id, {
          fromDate: selectedDate,
          toDate: selectedDate,
        }),
        s1.getMeDay(selectedDate).catch(() => null),
      ]);
      setAssignments(sortMealsByTime(scheduledAssignments(listed.items)));
      setDayTotals(day);
      setOffline(false);
    } catch (err) {
      setOffline(true);
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't refresh diet. Pull to try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, relationship.id, selectedDate, s1]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    return subscribeAll(() => {
      void load();
    });
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const rings = useMemo(
    () => buildNutritionRings(assignments, dayTotals?.totals ?? null),
    [assignments, dayTotals],
  );

  async function confirmMeal(assignment: MealAssignment) {
    setActingId(assignment.id);
    setError(null);
    try {
      await confirmMealAssignment(
        api,
        sync,
        relationship.id,
        assignment,
        coachName,
      );
      invalidateRelationshipDayData(relationship.id);
      await load();
    } catch (err) {
      setError(
        err instanceof MealSyncError
          ? err.message
          : err instanceof ApiClientError
            ? err.message
            : "Could not confirm meal.",
      );
    } finally {
      setActingId(null);
    }
  }

  async function skipMeal(assignment: MealAssignment) {
    setActingId(assignment.id);
    setError(null);
    try {
      await skipMealAssignment(
        sync,
        assignment,
        null,
        coachName,
        relationship.id,
      );
      setSkippedUndo({
        assignmentId: assignment.id,
        mealName: assignment.mealName,
      });
      await load();
    } catch (err) {
      setError(
        err instanceof MealSyncError
          ? err.message
          : err instanceof ApiClientError
            ? err.message
            : "Could not skip meal.",
      );
    } finally {
      setActingId(null);
    }
  }

  return (
    <Screen
      chrome="app"
      title="Diet"
      showHeader={false}
      refreshing={refreshing}
      onRefresh={() => {
        void onRefresh();
      }}
    >
      {error ? <ErrorBanner message={error} /> : null}
      {offline ? (
        <Text style={styles.offline}>Saved on phone · Not sent yet</Text>
      ) : null}
      <View style={styles.header}>
        <TraineeDateNavigator
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
        />
        <Text style={styles.summary} accessibilityLabel={mealsLoggedSummary(assignments)}>
          {mealsLoggedSummary(assignments)}
        </Text>
      </View>
      <View style={styles.ringsWrap}>
        {Platform.OS === "web" ? (
          <WebNutritionSummary data={rings} />
        ) : (
          <NutritionRings data={rings} compact />
        )}
        {rings.some((r) => r.unknown) ? (
          <Text style={styles.footnote}>
            Some foods have no nutrition data · totals show ≥
          </Text>
        ) : null}
      </View>
      {loading ? (
        <Text style={styles.muted} accessibilityLabel="Loading meals">
          Loading meals…
        </Text>
      ) : (
        <View style={styles.stack}>
          {assignments.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.rowTitle}>No meals planned today.</Text>
              <Text style={styles.instructions}>
                Meals appear when your trainer publishes a nutrition plan.
              </Text>
            </View>
          ) : (
            assignments.map((meal) => {
              const lockCopy = mealLockCopy(meal, coachName);
              const canLog =
                !lockCopy &&
                canLogMealOnDate({
                  selectedDate,
                  today,
                  meal,
                  unresolvedExceptionCount: unresolvedExceptions,
                });
              const kcal = mealKcalFromDayTotals(
                meal,
                dayTotals?.totals.perMeal,
              );
              const logged = isMealLoggedForCount(meal.status);
              return (
                <View key={meal.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardTitles}>
                      <Text style={styles.rowTitle}>
                        {cleanFoodLabel(meal.mealName)}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {formatClockTime(meal.windowStartsAt, timeZone)}
                        {kcal != null ? ` · ${formatKcal(kcal)}` : ""}
                      </Text>
                    </View>
                    <StatusChip
                      label={lockCopy ? "Closed" : statusLabel(meal.status)}
                      tone={lockCopy ? "neutral" : statusTone(meal.status)}
                    />
                  </View>
                  {meal.photoRequired && !lockCopy ? (
                    <Text style={styles.photoChip}>📷 Photo requested</Text>
                  ) : null}
                  {lockCopy ? (
                    <Text style={styles.lockCopy}>{lockCopy}</Text>
                  ) : canLog ? (
                    <View style={styles.actions}>
                      <PrimaryButton
                        label="Eaten as planned"
                        loading={actingId === meal.id}
                        onPress={() => {
                          void confirmMeal(meal);
                        }}
                      />
                      <PrimaryButton
                        label="Something different"
                        variant="secondary"
                        onPress={() =>
                          onOpenOverlay({
                            screen: "something_different",
                            assignmentId: meal.id,
                          })
                        }
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Skip this meal"
                        onPress={() => {
                          void skipMeal(meal);
                        }}
                        style={styles.skipHit}
                      >
                        <Text style={styles.skipLink}>Skip this meal</Text>
                      </Pressable>
                    </View>
                  ) : logged ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Change meal log"
                      onPress={() =>
                        onOpenOverlay({
                          screen: "something_different",
                          assignmentId: meal.id,
                        })
                      }
                      style={styles.skipHit}
                    >
                      <Text style={styles.changeLink}>Change</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      )}
      {skippedUndo ? (
        <Snackbar
          message={`${skippedUndo.mealName} skipped`}
          actionLabel="Undo"
          onAction={() => {
            setSkippedUndo(null);
            setError(
              "Undo is not synced yet — log the meal again if you skipped by mistake.",
            );
          }}
          onDismiss={() => setSkippedUndo(null)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  summary: {
    color: colors.midGrey,
    fontSize: 14,
    fontWeight: "600",
  },
  ringsWrap: {
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  footnote: {
    color: colors.midGrey,
    fontSize: 12,
  },
  offline: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  stack: {
    gap: spacing.lg,
  },
  muted: {
    color: colors.midGrey,
    fontSize: 15,
  },
  card: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  cardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  cardTitles: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: colors.deepNavy,
    fontSize: 18,
    fontWeight: "700",
  },
  rowMeta: {
    color: colors.midGrey,
    fontSize: 14,
  },
  photoChip: {
    color: colors.indigo,
    fontSize: 13,
    fontWeight: "600",
  },
  instructions: {
    color: colors.darkGrey,
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  skipHit: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  skipLink: {
    color: colors.midGrey,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  changeLink: {
    color: colors.indigo,
    fontSize: 14,
    fontWeight: "600",
  },
  lockCopy: {
    color: colors.midGrey,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginTop: spacing.xs,
  },
});
