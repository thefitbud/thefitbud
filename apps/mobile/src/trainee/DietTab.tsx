import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type { CoachingRelationship, MealAssignment } from "@fitbud/contracts";
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
import { confirmMealAssignment, skipMealAssignment } from "./mealActions";
import {
  canLogMealOnDate,
  mealKcalFromDayTotals,
} from "./mealHelpers";
import { buildNutritionRings } from "./nutrition";
import { scheduledAssignments } from "./scheduledAssignments";

function statusLabel(status: MealAssignment["status"]): string {
  switch (status) {
    case "pending":
      return "Due";
    case "confirmed":
      return "As planned";
    case "modified":
      return "Changed";
    case "skipped":
      return "Skipped";
    case "logged_later":
      return "Logged late";
    case "overdue":
      return "Overdue";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
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
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [dayTotals, setDayTotals] = useState<Awaited<
    ReturnType<typeof s1.getMeDay>
  > | null>(null);
  const [unresolvedExceptions, setUnresolvedExceptions] = useState(0);
  const [skippedUndo, setSkippedUndo] = useState<{
    assignmentId: string;
    mealName: string;
  } | null>(null);

  const timeZone = me?.timezone ?? "UTC";
  const today = useMemo(() => localDateInTimezone(timeZone), [timeZone]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listed, day, exceptions] = await Promise.all([
        api.listMealAssignments(relationship.id, {
          fromDate: selectedDate,
          toDate: selectedDate,
        }),
        s1.getMeDay(selectedDate).catch(() => null),
        api.listExceptions(relationship.id).catch(() => ({ items: [] })),
      ]);
      setAssignments(scheduledAssignments(listed.items));
      setDayTotals(day);
      setUnresolvedExceptions(
        exceptions.items.filter(
          (item) =>
            item.status === "detected" ||
            item.status === "active" ||
            item.status === "acknowledged",
        ).length,
      );
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load diet for this day.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, relationship.id, selectedDate, s1]);

  useEffect(() => {
    void load();
  }, [load]);

  const rings = useMemo(
    () => buildNutritionRings(assignments, dayTotals?.totals ?? null),
    [assignments, dayTotals],
  );

  const loggedCount = assignments.filter(
    (meal) =>
      meal.status !== "pending" && meal.status !== "overdue",
  ).length;

  async function confirmMeal(assignment: MealAssignment) {
    setActingId(assignment.id);
    setError(null);
    try {
      await confirmMealAssignment(api, sync, relationship.id, assignment);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
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
      await skipMealAssignment(sync, assignment);
      setSkippedUndo({
        assignmentId: assignment.id,
        mealName: assignment.mealName,
      });
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not skip meal.",
      );
    } finally {
      setActingId(null);
    }
  }

  return (
    <Screen chrome="app" title="Diet" showHeader={false}>
      {error ? <ErrorBanner message={error} /> : null}
      <View style={styles.header}>
        <TraineeDateNavigator
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
        />
        <Text style={styles.summary}>
          {loggedCount} of {assignments.length} meals logged
        </Text>
      </View>
      <View style={styles.ringsWrap}>
        <NutritionRings data={rings} compact />
      </View>
      {loading ? (
        <Text style={styles.muted}>Loading meals…</Text>
      ) : (
        <View style={styles.stack}>
          {assignments.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.rowTitle}>No meals assigned</Text>
              <Text style={styles.instructions}>
                Meals appear when your trainer publishes a nutrition plan.
              </Text>
            </View>
          ) : (
            assignments.map((meal) => {
              const canLog = canLogMealOnDate({
                selectedDate,
                today,
                meal,
                unresolvedExceptionCount: unresolvedExceptions,
              });
              const kcal = mealKcalFromDayTotals(
                meal,
                dayTotals?.totals.perMeal,
              );
              return (
                <View key={meal.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.rowTitle}>{meal.mealName}</Text>
                    <View style={styles.headerRight}>
                      {kcal != null ? (
                        <Text style={styles.kcal}>{kcal} kcal</Text>
                      ) : null}
                      <StatusChip
                        label={statusLabel(meal.status)}
                        tone={statusTone(meal.status)}
                      />
                    </View>
                  </View>
                  {meal.prescription.scheduleHint ? (
                    <Text style={styles.rowMeta}>
                      {meal.prescription.scheduleHint}
                    </Text>
                  ) : null}
                  {meal.photoRequired ? (
                    <Text style={styles.photoChip}>Photo requested</Text>
                  ) : null}
                  {canLog ? (
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
                        onPress={() => {
                          void skipMeal(meal);
                        }}
                      >
                        <Text style={styles.skipLink}>Skip this meal</Text>
                      </Pressable>
                    </View>
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
    borderRadius: radii.card,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  cardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headerRight: {
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  kcal: {
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "600",
  },
  rowTitle: {
    color: colors.deepNavy,
    flex: 1,
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
  skipLink: {
    color: colors.midGrey,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: spacing.sm,
  },
});
