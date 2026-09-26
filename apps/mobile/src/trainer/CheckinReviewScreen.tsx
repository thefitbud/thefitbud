import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CheckinReviewContext,
  CheckinReviewOutcome,
} from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Field } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { createIdempotencyKey } from "../lib/idempotency";
import { statusLabel } from "./labels";
import { openContextualWhatsApp } from "./whatsapp";

const OUTCOMES: Array<{ value: CheckinReviewOutcome; label: string }> = [
  { value: "acknowledged", label: "Acknowledged" },
  { value: "needs_follow_up", label: "Needs follow-up" },
  { value: "adjust_coaching", label: "Adjust coaching (note only)" },
];

type Props = {
  checkinId: string;
  relationshipId: string;
  onBack: () => void;
  onOpenClient: (relationshipId: string) => void;
};

export function CheckinReviewScreen({
  checkinId,
  relationshipId,
  onBack,
  onOpenClient,
}: Props) {
  const { api } = useAuth();
  const [context, setContext] = useState<CheckinReviewContext | null>(null);
  const [outcome, setOutcome] =
    useState<CheckinReviewOutcome>("acknowledged");
  const [reviewNotes, setReviewNotes] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const resolvedRelationshipId =
    relationshipId || context?.checkin.coachingRelationshipId || "";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getCheckinReviewContext(checkinId);
      setContext(result);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load review context.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, checkinId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function recordOutcome() {
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      await api.recordCheckinReview(
        checkinId,
        {
          outcome,
          notes: reviewNotes.trim() ? reviewNotes.trim() : null,
        },
        createIdempotencyKey(),
      );
      setMessage("Outcome recorded.");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not record outcome.",
      );
    } finally {
      setActing(false);
    }
  }

  async function scheduleNext() {
    if (!resolvedRelationshipId) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.scheduleNextCheckin(
        resolvedRelationshipId,
        { fromCheckinId: checkinId },
        createIdempotencyKey(),
      );
      setMessage(
        result.created
          ? `Next check-in scheduled for ${result.checkin.localDate}.`
          : `Next check-in already exists for ${result.checkin.localDate}.`,
      );
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not schedule next check-in.",
      );
    } finally {
      setActing(false);
    }
  }

  async function recordNote() {
    if (!resolvedRelationshipId || !noteBody.trim()) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      await api.createTrainerNote(
        resolvedRelationshipId,
        {
          body: noteBody.trim(),
          checkinId,
        },
        createIdempotencyKey(),
      );
      setNoteBody("");
      setMessage("Note recorded.");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not record note.",
      );
    } finally {
      setActing(false);
    }
  }

  return (
    <Screen
      title="Check-in review"
      subtitle="Submission, adherence, and quick actions. Plan builder stays on web."
      footer={
        <PrimaryButton label="Back" variant="ghost" onPress={onBack} />
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      {loading || !context ? (
        <Text style={styles.muted}>Loading review…</Text>
      ) : (
        <View style={styles.stack}>
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Submission</Text>
            <Text style={styles.body}>
              {statusLabel(context.checkin.status)} · Due{" "}
              {context.checkin.localDate}
            </Text>
            {context.checkin.answers ? (
              <>
                <Text style={styles.body}>
                  Wellbeing: {context.checkin.answers.wellbeing ?? "—"}
                </Text>
                <Text style={styles.body}>
                  Notes: {context.checkin.answers.notes ?? "—"}
                </Text>
                <Text style={styles.body}>
                  Body weight:{" "}
                  {context.checkin.answers.bodyWeightKg != null
                    ? `${context.checkin.answers.bodyWeightKg} kg`
                    : "—"}
                </Text>
              </>
            ) : (
              <Text style={styles.muted}>No answers submitted yet.</Text>
            )}
          </View>

          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Recent adherence</Text>
            <Text style={styles.body}>
              Workouts completed {context.recentWorkoutAdherence.completed} ·
              missed {context.recentWorkoutAdherence.missed}
            </Text>
            <Text style={styles.body}>
              Meals confirmed {context.recentMealCompliance.confirmed} · overdue{" "}
              {context.recentMealCompliance.overdue}
            </Text>
          </View>

          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Active exceptions</Text>
            {context.activeExceptions.length === 0 ? (
              <Text style={styles.muted}>None.</Text>
            ) : (
              context.activeExceptions.map((item) => (
                <Text key={item.id} style={styles.body}>
                  {statusLabel(item.status)} · {item.summary}
                </Text>
              ))
            )}
          </View>

          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Current plan</Text>
            {context.currentPlan ? (
              <Text style={styles.body}>
                {context.currentPlan.title} · v
                {context.currentPlan.versionNumber}
              </Text>
            ) : (
              <Text style={styles.muted}>No effective plan.</Text>
            )}
            <Text style={styles.muted}>
              Adjust coaching / publish on trainer web — not on mobile.
            </Text>
          </View>

          {context.checkin.status === "submitted" ? (
            <View style={styles.stack}>
              <Text style={styles.sectionTitle}>Record outcome</Text>
              {OUTCOMES.map((item) => (
                <PrimaryButton
                  key={item.value}
                  label={item.label}
                  variant={outcome === item.value ? "primary" : "secondary"}
                  onPress={() => setOutcome(item.value)}
                />
              ))}
              <Field
                label="Outcome notes"
                value={reviewNotes}
                onChangeText={setReviewNotes}
                multiline
              />
              <PrimaryButton
                label="Record Outcome"
                loading={acting}
                onPress={() => {
                  void recordOutcome();
                }}
              />
            </View>
          ) : (
            <Text style={styles.muted}>
              Record Outcome is available after the trainee submits.
            </Text>
          )}

          <PrimaryButton
            label="Schedule Next"
            variant="secondary"
            loading={acting}
            onPress={() => {
              void scheduleNext();
            }}
          />

          <Field
            label="Trainer note"
            value={noteBody}
            onChangeText={setNoteBody}
            multiline
          />
          <PrimaryButton
            label="Record Note"
            variant="secondary"
            loading={acting}
            disabled={!noteBody.trim()}
            onPress={() => {
              void recordNote();
            }}
          />

          <PrimaryButton
            label="Open client status"
            variant="secondary"
            onPress={() => onOpenClient(resolvedRelationshipId)}
          />

          <PrimaryButton
            label="WhatsApp (outside FitBud)"
            variant="ghost"
            onPress={() => {
              void openContextualWhatsApp({
                draftText: "Following up on your check-in",
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
  sectionTitle: {
    color: colors.deepNavy,
    fontSize: 16,
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
