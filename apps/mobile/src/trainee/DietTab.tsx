import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type { CoachingRelationship, MealAssignment } from "@fitbud/contracts";
import { NutritionRings, colors, radii, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { StatusChip } from "../components/StatusChip";
import { localDateInTimezone } from "../lib/dates";
import { stage1Api } from "../lib/stage1Api";
import {
  MINIMAL_PNG_CONTENT_TYPE,
  minimalPngBytes,
} from "../lib/minimalPng";
import { createIdempotencyKey } from "../lib/idempotency";
import type { TraineeOverlayOpener } from "../navigation/TraineeOverlay";
import { buildNutritionRings } from "./nutrition";
import { scheduledAssignments } from "./scheduledAssignments";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";

function statusLabel(status: MealAssignment["status"]): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "confirmed":
      return "As planned";
    case "modified":
      return "Modified";
    case "skipped":
      return "Skipped";
    case "logged_later":
      return "Logged later";
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

function canActOnMeal(status: MealAssignment["status"]): boolean {
  return status === "pending" || status === "overdue";
}

export function DietTab({
  relationship,
  selectedDate,
  onOpenOverlay,
}: {
  relationship: CoachingRelationship;
  selectedDate: string;
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

  const timeZone = me?.timezone ?? "UTC";
  const today = useMemo(() => localDateInTimezone(timeZone), [timeZone]);
  const canLog = selectedDate === today;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listed, day] = await Promise.all([
        api.listMealAssignments(relationship.id, {
          fromDate: selectedDate,
          toDate: selectedDate,
        }),
        s1.getMeDay(selectedDate).catch(() => null),
      ]);
      setAssignments(scheduledAssignments(listed.items));
      setDayTotals(day);
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

  async function uploadMealPhoto(assignment: MealAssignment): Promise<string> {
    const target = await api.createUploadTarget(
      {
        coachingRelationshipId: relationship.id,
        mediaType: "meal_photo",
        contentType: MINIMAL_PNG_CONTENT_TYPE,
        originalFilename: `meal-${assignment.id}.png`,
      },
      createIdempotencyKey(),
    );
    await api.uploadMediaContent(
      target.mediaAsset.id,
      minimalPngBytes(),
      MINIMAL_PNG_CONTENT_TYPE,
    );
    return target.mediaAsset.id;
  }

  async function confirmMeal(assignment: MealAssignment) {
    setActingId(assignment.id);
    setError(null);
    try {
      const photoIntent = assignment.photoRequired
        ? {
            notedAt: new Date().toISOString(),
            mediaAssetId: await uploadMealPhoto(assignment),
            contentType: MINIMAL_PNG_CONTENT_TYPE,
            clientRef: `meal-photo-${assignment.id}`,
          }
        : null;
      await enqueueAndPush(sync, {
        recordId: assignment.id,
        operation: "meal.confirm",
        payload: {
          assignmentId: assignment.id,
          body: { photoIntent },
        },
      });
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

  return (
    <Screen chrome="app" title="Diet" showHeader={false}>
      {error ? <ErrorBanner message={error} /> : null}
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
            assignments.map((meal) => (
              <View key={meal.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.rowTitle}>{meal.mealName}</Text>
                  <StatusChip
                    label={statusLabel(meal.status)}
                    tone={statusTone(meal.status)}
                  />
                </View>
                {meal.prescription.scheduleHint ? (
                  <Text style={styles.rowMeta}>
                    {meal.prescription.scheduleHint}
                  </Text>
                ) : null}
                {canActOnMeal(meal.status) && canLog ? (
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
                  </View>
                ) : null}
              </View>
            ))
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  instructions: {
    color: colors.darkGrey,
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
