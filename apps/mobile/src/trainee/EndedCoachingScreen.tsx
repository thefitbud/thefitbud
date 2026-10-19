import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Flag } from "lucide-react-native";
import type { CoachingRelationship, PendingReactivation } from "@fitbud/contracts";
import { formatCivilDate, formatLocalDate } from "@fitbud/core";
import { brand, ink } from "@fitbud/tokens";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../components/Text";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { ErrorBanner } from "../components/ErrorBanner";
import { messageFromError, useAuth } from "../auth/AuthProvider";
import { M2Button, M2Group, M2Hero, M2Page, M2Row } from "./settings/m2";

type Props = {
  relationship: CoachingRelationship;
  coachName: string;
  onOpenHistory: () => void;
  onSignOut: () => void;
  onCoachingResumed: (relationship: CoachingRelationship) => void;
};

function endedOn(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return formatCivilDate(formatLocalDate(new Date(iso), "Asia/Kolkata"));
}

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
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);

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

  const expired =
    pending != null && new Date(pending.expiresAt).getTime() < Date.now();
  const showReactivationCard =
    !cardDismissed && pending != null && !loading && !expired;

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
  const when = endedOn(relationship.endedAt);

  return (
    <M2Page
      title="Coaching"
      subtitle="Your history stays in FitBud. A new coach always starts fresh."
      refreshing={loading}
      onRefresh={() => {
        void refreshPending();
      }}
    >
      <M2Hero
        icon={<Flag color={brand.indigo} size={22} strokeWidth={1.75} />}
        title="Coaching ended"
        subtitle={
          when
            ? `With ${trainerLabel} on ${when}. Your history is still here.`
            : `With ${trainerLabel}. Your history is still here.`
        }
      />

      {error ? <ErrorBanner message={error} /> : null}

      {expired ? (
        <Text style={styles.body}>
          This request has expired. Ask {trainerLabel} to send a new one.
        </Text>
      ) : null}

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
          <M2Button
            label={confirming ? "Restarting…" : "Restart coaching"}
            disabled={confirming}
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
        You can still browse past logs and check-ins. If the same coach
        restarts with you, your workspace can be restored.
      </Text>
      <Text style={styles.body}>
        Got an invite from a new coach? Open the link, or enter a code.
      </Text>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Invite code</Text>
        <TextInput
          accessibilityLabel="Invite code"
          value={inviteCode}
          onChangeText={setInviteCode}
          autoCapitalize="none"
          placeholder="Code from your coach"
          placeholderTextColor={ink[500]}
          style={styles.code}
        />
      </View>
      <M2Button
        label={joining ? "Checking…" : "Use this code"}
        disabled={joining}
        onPress={() => {
          const token = inviteCode.trim();
          if (!token) {
            setError("Enter the code from your new coach.");
            return;
          }
          setJoining(true);
          setError(null);
          void api
            .acceptInvitation({
              token,
              timezone:
                Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            })
            .then(() => {
              setError(null);
              setInviteCode("");
            })
            .catch((err) => setError(messageFromError(err)))
            .finally(() => setJoining(false));
        }}
      />
      <M2Group>
        <M2Row
          label="Past coaching"
          hint="Browse past logs"
          onPress={onOpenHistory}
        />
      </M2Group>
      <M2Button label="Sign out" variant="secondary" onPress={onSignOut} />
    </M2Page>
  );
}

const styles = StyleSheet.create({
  body: {
    color: ink[700],
    fontSize: 15,
    lineHeight: 22,
  },
  reactivationCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    gap: spacing.md,
    padding: spacing.lg,
  },
  reactivationTitle: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
    lineHeight: 24,
  },
  notNow: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "500",
    minHeight: 44,
    textAlign: "center",
  },
  field: { gap: 6 },
  fieldLabel: {
    color: ink[700],
    fontFamily: fontFamilySemiBold,
    fontSize: 13,
  },
  code: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: radii.card,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
});
