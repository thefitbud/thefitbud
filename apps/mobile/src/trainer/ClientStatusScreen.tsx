import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type {
  Checkin,
  EffectivePlanResponse,
  Exception,
  MealComplianceSummaryResponse,
  WorkoutAdherenceResponse,
} from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { createIdempotencyKey } from "../lib/idempotency";
import { onboardingStatusLabel } from "./clients";
import { statusLabel, typeLabel } from "./labels";
import { openContextualWhatsApp } from "./whatsapp";

type Props = {
  relationshipId: string;
  displayName: string;
  onboardingStatusLabelText?: string;
  onBack: () => void;
  onOpenException: (exceptionId: string) => void;
  onOpenCheckin: (checkinId: string) => void;
};

export function ClientStatusScreen({
  relationshipId,
  displayName,
  onboardingStatusLabelText,
  onBack,
  onOpenException,
  onOpenCheckin,
}: Props) {
  const { api, relationships } = useAuth();
  const relationship = relationships.find((item) => item.id === relationshipId);
  const [plan, setPlan] = useState<EffectivePlanResponse | null>(null);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutAdherenceResponse | null>(
    null,
  );
  const [meals, setMeals] = useState<MealComplianceSummaryResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [effective, exceptionPage, checkinPage, adherence, compliance] =
        await Promise.all([
          api.getEffectivePlan(relationshipId),
          api.listExceptions(relationshipId),
          api.listCheckins(relationshipId),
          api.getWorkoutAdherence(relationshipId),
          api.getMealCompliance(relationshipId),
        ]);
      setPlan(effective);
      setExceptions(
        exceptionPage.items.filter(
          (item) =>
            item.status === "detected" ||
            item.status === "active" ||
            item.status === "acknowledged",
        ),
      );
      setCheckins(checkinPage.items);
      setWorkouts(adherence);
      setMeals(compliance);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load client status.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, relationshipId]);

  useEffect(() => {
    void load();
  }, [load]);

  const nextCheckin = checkins
    .filter(
      (item) =>
        item.status === "scheduled" ||
        item.status === "due" ||
        item.status === "overdue" ||
        item.status === "submitted",
    )
    .sort((a, b) => a.localDate.localeCompare(b.localDate))[0];

  async function ensureDue() {
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.ensureDueCheckin(
        relationshipId,
        createIdempotencyKey(),
      );
      setMessage(
        result.created
          ? `Check-in ready for ${result.checkin.localDate}.`
          : `Check-in already exists for ${result.checkin.localDate}.`,
      );
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not ensure due check-in.",
      );
    } finally {
      setActing(false);
    }
  }

  const statusText =
    onboardingStatusLabelText ??
    (relationship
      ? onboardingStatusLabel(relationship.onboardingStatus)
      : "Unknown");

  return (
    <Screen
      title={displayName}
      subtitle="Client status — quick context, not a full workspace."
      footer={
        <PrimaryButton label="Back to clients" variant="ghost" onPress={onBack} />
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      {loading ? (
        <Text style={styles.muted}>Loading status…</Text>
      ) : (
        <View style={styles.stack}>
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Current state</Text>
            <Text style={styles.body}>{statusText}</Text>
          </View>

          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Effective plan</Text>
            {plan?.version ? (
              <Text style={styles.body}>
                {plan.plan?.title ?? "Plan"} · v{plan.version.versionNumber}
              </Text>
            ) : (
              <Text style={styles.muted}>No effective plan yet.</Text>
            )}
            <Text style={styles.muted}>
              Deep plan editing stays on trainer web.
            </Text>
          </View>

          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Adherence snapshot</Text>
            <Text style={styles.body}>
              Workouts completed {workouts?.totals.completed ?? 0} · missed{" "}
              {workouts?.totals.missed ?? 0}
            </Text>
            <Text style={styles.body}>
              Meals confirmed {meals?.totals.confirmed ?? 0} · overdue{" "}
              {meals?.totals.overdue ?? 0}
            </Text>
          </View>

          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Active exceptions</Text>
            {exceptions.length === 0 ? (
              <Text style={styles.muted}>None open.</Text>
            ) : (
              exceptions.map((item) => (
                <PrimaryButton
                  key={item.id}
                  label={`${statusLabel(item.status)} · ${typeLabel(item.type)}`}
                  variant="secondary"
                  onPress={() => onOpenException(item.id)}
                />
              ))
            )}
          </View>

          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Next check-in</Text>
            {nextCheckin ? (
              <>
                <Text style={styles.body}>
                  {statusLabel(nextCheckin.status)} · {nextCheckin.localDate}
                </Text>
                <PrimaryButton
                  label="Open check-in"
                  onPress={() => onOpenCheckin(nextCheckin.id)}
                />
              </>
            ) : (
              <Text style={styles.muted}>No upcoming check-in.</Text>
            )}
          </View>

          <PrimaryButton
            label="Ensure due check-in"
            variant="secondary"
            loading={acting}
            onPress={() => {
              void ensureDue();
            }}
          />

          <PrimaryButton
            label="WhatsApp (outside FitBud)"
            variant="ghost"
            onPress={() => {
              void openContextualWhatsApp({
                draftText: `Hi — quick note from FitBud about ${displayName}`,
              });
            }}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  banner: {
    backgroundColor: colors.paleLavender,
    borderRadius: 12,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  bannerTitle: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "600",
  },
  body: {
    color: colors.nearBlack,
    fontSize: 14,
    lineHeight: 20,
  },
  muted: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  success: {
    color: colors.success,
    fontSize: 14,
    marginBottom: spacing.md,
  },
});
