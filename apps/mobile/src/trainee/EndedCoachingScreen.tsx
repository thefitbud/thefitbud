import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { CoachingRelationship, PendingReactivation } from "@fitbud/contracts";
import { Text } from "../components/Text";
import { colors, spacing } from "@fitbud/ui-mobile";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { ErrorBanner } from "../components/ErrorBanner";
import { messageFromError, useAuth } from "../auth/AuthProvider";
import { CoachingEndedBanner } from "./CoachingEndedBanner";

type Props = {
  relationship: CoachingRelationship;
  coachName: string;
  onOpenHistory: () => void;
  onSignOut: () => void;
  onCoachingResumed: (relationship: CoachingRelationship) => void;
};

export function EndedCoachingScreen({
  relationship,
  coachName,
  onOpenHistory,
  onSignOut,
  onCoachingResumed,
}: Props) {
  const { api } = useAuth();
  const [pending, setPending] = useState<PendingReactivation | null | undefined>(
    relationship.pendingReactivation,
  );
  const [cardDismissed, setCardDismissed] = useState(false);
  const [loading, setLoading] = useState(
    relationship.pendingReactivation === undefined,
  );
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await api.getRelationship(relationship.id);
      setPending(detail.pendingReactivation ?? null);
    } catch (err) {
      setError(messageFromError(err));
      setPending(null);
    } finally {
      setLoading(false);
    }
  }, [api, relationship.id]);

  useEffect(() => {
    if (relationship.pendingReactivation !== undefined) {
      setPending(relationship.pendingReactivation);
      setLoading(false);
      return;
    }
    void refreshPending();
  }, [relationship.id, relationship.pendingReactivation, refreshPending]);

  const showReactivationCard =
    !cardDismissed && pending != null && !loading;

  const handleConfirm = async () => {
    setConfirming(true);
    setError(null);
    try {
      const updated = await api.confirmReactivation(relationship.id);
      onCoachingResumed(updated);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setConfirming(false);
    }
  };

  const trainerLabel = coachName.trim() || "Your coach";

  return (
    <Screen
      title="Coaching ended"
      subtitle="Your history stays in FitBud. A new coach always starts fresh."
      refreshing={loading}
      onRefresh={() => {
        void refreshPending();
      }}
    >
      <View style={styles.stack}>
        <CoachingEndedBanner
          coachName={trainerLabel}
          endedAt={relationship.endedAt}
        />

        {error ? <ErrorBanner message={error} /> : null}

        {showReactivationCard ? (
          <View style={styles.reactivationCard}>
            <Text style={styles.reactivationTitle}>
              {trainerLabel} wants to restart coaching with you
            </Text>
            <Text style={styles.body}>
              Your history and settings stay as they are. {trainerLabel} will
              send your plan when coaching picks up again.
            </Text>
            {pending?.intakeUpdateRequested ? (
              <Text style={styles.body}>
                You may be asked to refresh your intake answers next.
              </Text>
            ) : null}
            <PrimaryButton
              label="Restart coaching"
              loading={confirming}
              onPress={() => {
                void handleConfirm();
              }}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setCardDismissed(true)}
              disabled={confirming}
            >
              <Text style={styles.notNow}>Not now</Text>
            </Pressable>
          </View>
        ) : null}

        {!showReactivationCard && !loading && pending === null && cardDismissed ? (
          <Text style={styles.body}>
            You can come back anytime before the request expires if you change
            your mind.
          </Text>
        ) : null}

        <Text style={styles.body}>
          This coaching relationship has ended. You can still browse past logs
          and check-ins. If the same coach restarts with you, your workspace
          can be restored.
        </Text>
        <PrimaryButton label="Past coaching" onPress={onOpenHistory} />
        <PrimaryButton label="Sign out" variant="ghost" onPress={onSignOut} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.lg,
  },
  body: {
    color: colors.darkGrey,
    fontSize: 15,
    lineHeight: 22,
  },
  reactivationCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    gap: spacing.md,
    padding: spacing.lg,
  },
  reactivationTitle: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 24,
  },
  notNow: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
  },
});
