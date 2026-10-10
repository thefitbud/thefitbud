import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CoachingRelationship,
  MealAssignment,
  MealDeviationKind,
} from "@fitbud/contracts";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { StatusChip } from "../components/StatusChip";
import { createIdempotencyKey } from "../lib/idempotency";
import {
  MINIMAL_PNG_CONTENT_TYPE,
  minimalPngBytes,
} from "../lib/minimalPng";
import { MealDeviationScreen } from "./MealDeviationScreen";
import { scheduledAssignments } from "./scheduledAssignments";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";

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
}: {
  relationship: CoachingRelationship;
}) {
  const { api, me } = useAuth();
  const sync = useSyncEngine();
  const [assignments, setAssignments] = useState<MealAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [deviating, setDeviating] = useState<MealAssignment | null>(null);

  const timeZone = me?.timezone ?? "UTC";
  const today = useMemo(() => localDateInTimezone(timeZone), [timeZone]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await api.generateMealAssignments(
        relationship.id,
        { fromDate: today, toDate: today },
        createIdempotencyKey(),
      );
      const listed = await api.listMealAssignments(relationship.id, {
        fromDate: today,
        toDate: today,
      });
      setAssignments(scheduledAssignments(listed.items));
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load today’s diet.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, relationship.id, today]);

  useEffect(() => {
    void load();
  }, [load]);

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

  async function skipMeal(assignment: MealAssignment) {
    setActingId(`skip-${assignment.id}`);
    setError(null);
    try {
      await enqueueAndPush(sync, {
        recordId: assignment.id,
        operation: "meal.skip",
        payload: {
          assignmentId: assignment.id,
          body: {},
        },
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

  async function submitDeviation(
    assignment: MealAssignment,
    input: { deviationKind: MealDeviationKind; notes: string | null },
  ) {
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
        operation: "meal.deviate",
        payload: {
          assignmentId: assignment.id,
          body: {
            deviationKind: input.deviationKind,
            notes: input.notes,
            photoIntent,
          },
        },
      });
      setDeviating(null);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not record deviation.",
      );
      throw err;
    } finally {
      setActingId(null);
    }
  }

  if (deviating) {
    return (
      <MealDeviationScreen
        assignment={deviating}
        loading={actingId === deviating.id}
        onCancel={() => setDeviating(null)}
        onSubmit={async (input) => {
          await submitDeviation(deviating, input);
        }}
      />
    );
  }

  return (
    <Screen
      chrome="app"
      title="Today’s diet"
      subtitle={`${today} · confirm what you ate, then move on.`}
    >
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? (
        <Text style={styles.muted}>Loading today’s meals…</Text>
      ) : (
        <View style={styles.stack}>
          {assignments.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.rowTitle}>No meals assigned</Text>
              <Text style={styles.instructions}>
                Meals appear here after your trainer publishes a nutrition plan
                and coaching is active.
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
                {meal.prescription.instructions ? (
                  <Text style={styles.instructions}>
                    {meal.prescription.instructions}
                  </Text>
                ) : null}
                {meal.photoRequired ? (
                  <Text style={styles.photoNote}>Photo required</Text>
                ) : null}
                {canActOnMeal(meal.status) ? (
                  <View style={styles.actions}>
                    <PrimaryButton
                      label="Confirm eaten as planned"
                      loading={actingId === meal.id}
                      onPress={() => {
                        void confirmMeal(meal);
                      }}
                    />
                    <View style={styles.secondaryRow}>
                      <View style={styles.secondaryAction}>
                        <PrimaryButton
                          label="Quick modify"
                          variant="secondary"
                          onPress={() => setDeviating(meal)}
                        />
                      </View>
                      <View style={styles.secondaryAction}>
                        <PrimaryButton
                          label="Skip"
                          variant="ghost"
                          loading={actingId === `skip-${meal.id}`}
                          onPress={() => {
                            void skipMeal(meal);
                          }}
                        />
                      </View>
                    </View>
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
  stack: {
    gap: spacing.lg,
    paddingTop: spacing.md,
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
  photoNote: {
    color: colors.indigo,
    fontSize: 13,
    fontWeight: "600",
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  secondaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  secondaryAction: {
    flex: 1,
  },
});
