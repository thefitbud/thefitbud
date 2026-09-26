import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CoachingRelationship,
  MealAssignment,
  MealDeviationKind,
} from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { createIdempotencyKey } from "../lib/idempotency";
import {
  MINIMAL_PNG_CONTENT_TYPE,
  minimalPngBytes,
} from "../lib/minimalPng";
import { MealDeviationScreen } from "./MealDeviationScreen";
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
      return "Confirmed";
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
      setAssignments(listed.items);
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
      title="Today’s Diet"
      subtitle="Confirm prescribed meals with minimum effort."
    >
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? (
        <Text style={styles.muted}>Loading today’s meals…</Text>
      ) : (
        <View style={styles.stack}>
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Today · {today}</Text>
            <Text style={styles.bannerBody}>
              Eat → Confirm → Move on. Use Deviate only when the meal changed.
            </Text>
          </View>

          {assignments.length === 0 ? (
            <Text style={styles.muted}>
              No meals assigned for today. Publish a nutrition plan and activate
              coaching configuration first.
            </Text>
          ) : (
            assignments.map((meal) => (
              <View key={meal.id} style={styles.card}>
                <Text style={styles.rowTitle}>{meal.mealName}</Text>
                <Text style={styles.rowMeta}>
                  {statusLabel(meal.status)}
                  {meal.prescription.scheduleHint
                    ? ` · ${meal.prescription.scheduleHint}`
                    : ""}
                </Text>
                {meal.prescription.instructions ? (
                  <Text style={styles.instructions}>
                    {meal.prescription.instructions}
                  </Text>
                ) : null}
                {meal.photoRequired ? (
                  <Text style={styles.photoNote}>
                    Photo required · association noted on confirm (upload in D1)
                  </Text>
                ) : null}
                {canActOnMeal(meal.status) ? (
                  <View style={styles.actions}>
                    <PrimaryButton
                      label="Confirm"
                      loading={actingId === meal.id}
                      onPress={() => {
                        void confirmMeal(meal);
                      }}
                    />
                    <PrimaryButton
                      label="Deviate"
                      variant="secondary"
                      onPress={() => setDeviating(meal)}
                    />
                    <PrimaryButton
                      label="Skip"
                      variant="ghost"
                      loading={actingId === `skip-${meal.id}`}
                      onPress={() => {
                        void skipMeal(meal);
                      }}
                    />
                  </View>
                ) : null}
              </View>
            ))
          )}

          <PrimaryButton
            label="Refresh"
            variant="secondary"
            onPress={() => {
              void load();
            }}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.lg,
  },
  banner: {
    backgroundColor: colors.paleLavender,
    borderRadius: 12,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  bannerTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "700",
  },
  bannerBody: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  muted: {
    color: colors.midGrey,
    fontSize: 14,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.lightGrey,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  rowTitle: {
    color: colors.nearBlack,
    fontSize: 16,
    fontWeight: "600",
  },
  rowMeta: {
    color: colors.midGrey,
    fontSize: 13,
  },
  instructions: {
    color: colors.darkGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  photoNote: {
    color: colors.indigo,
    fontSize: 13,
    fontWeight: "500",
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
