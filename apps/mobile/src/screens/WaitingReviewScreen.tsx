import type { CoachingRelationship } from "@fitbud/contracts";
import { whatsappHref } from "@fitbud/core";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";

function checklistFor(relationship: CoachingRelationship) {
  const status = relationship.onboardingStatus;
  return [
    { label: "Joined FitBud", done: true },
    {
      label: "Intake sent",
      done:
        status === "onboarding_submitted" ||
        status === "coaching_ready" ||
        status === "active",
    },
    {
      label: "Coach reviews your answers",
      done: status === "coaching_ready" || status === "active",
    },
    {
      label: "Your plan is ready",
      done: status === "active",
    },
  ];
}

function coachFirstName(relationship: CoachingRelationship): string {
  const raw = relationship.trainerDisplayName?.trim();
  if (!raw) return "your coach";
  return raw.split(/\s+/)[0] ?? raw;
}

export function WaitingReviewScreen({
  relationship,
}: {
  relationship: CoachingRelationship;
}) {
  const { refreshSession, signOut } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const steps = checklistFor(relationship);
  const coach = coachFirstName(relationship);
  const phoneE164 = relationship.trainerWhatsappE164 ?? null;
  const hasNumber = Boolean(phoneE164 && phoneE164.replace(/\D/g, "").length >= 10);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await refreshSession();
      setOffline(false);
    } catch {
      setError("Couldn't refresh. Pull to try again.");
      setOffline(true);
    } finally {
      setRefreshing(false);
    }
  }, [refreshSession]);

  useEffect(() => {
    const timer = setInterval(() => {
      void refreshSession().catch(() => {
        setOffline(true);
      });
    }, 20_000);
    return () => clearInterval(timer);
  }, [refreshSession]);

  const subtitle =
    relationship.onboardingStatus === "coaching_ready"
      ? `${coach} is building your plan.`
      : "Your coach is reviewing your intake. You can set up reminders while you wait.";

  return (
    <Screen
      title="Waiting for your plan"
      subtitle={subtitle}
      refreshing={refreshing}
      onRefresh={() => {
        void refresh();
      }}
    >
      {error ? <ErrorBanner message={error} /> : null}
      {offline ? (
        <Text style={styles.offline}>You're offline · we'll keep checking</Text>
      ) : null}

      <View style={styles.banner} accessibilityLabel={`${coach} is preparing your plan`}>
        <Text style={styles.bannerTitle}>{coach} is preparing your plan</Text>
        <Text style={styles.bannerBody}>
          We'll notify you when your coaching plan is ready. Pull down to check
          for updates.
        </Text>
      </View>

      <View style={styles.checklist}>
        {steps.map((step) => (
          <Text
            key={step.label}
            style={[styles.checkItem, step.done ? styles.checkDone : null]}
            accessibilityLabel={`${step.label}${step.done ? ", done" : ", pending"}`}
          >
            {step.done ? "✓" : "○"} {step.label}
          </Text>
        ))}
      </View>

      <Text style={styles.meanwhile}>Meanwhile</Text>
      <Text style={styles.hint}>
        • Set up reminders so logging is easy once your plan goes live{"\n"}
        • Message {coach} on WhatsApp if you have a quick question
      </Text>

      <PrimaryButton
        label={`Message ${coach}`}
        variant="whatsapp"
        disabled={!hasNumber}
        onPress={() => {
          if (!hasNumber) return;
          const text = `Hi ${coach}, I've filled my FitBud intake and I'm ready when you are.`;
          // Prefill only — never auto-send (product rule).
          void Linking.openURL(
            whatsappHref({ phoneE164, draftText: text }),
          );
        }}
      />
      {!hasNumber ? (
        <Text style={styles.noNumber}>
          {coach}'s WhatsApp number isn't on file yet.
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        onPress={signOut}
        style={styles.signOut}
      >
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.paleLavender,
    borderRadius: radii.card,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  bannerTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
  bannerBody: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  checklist: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  checkItem: {
    color: colors.midGrey,
    fontSize: 15,
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
  checkDone: {
    color: colors.deepNavy,
    fontWeight: "600",
  },
  meanwhile: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  hint: {
    color: colors.darkGrey,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  offline: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: spacing.md,
  },
  noNumber: {
    color: colors.midGrey,
    fontSize: 13,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  signOut: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xl,
    minHeight: 44,
  },
  signOutLabel: {
    color: colors.midGrey,
    fontSize: 15,
    fontWeight: "600",
  },
});
