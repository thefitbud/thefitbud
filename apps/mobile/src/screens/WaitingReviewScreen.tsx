import type { CoachingRelationship } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/AuthProvider";
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

export function WaitingReviewScreen({
  relationship,
}: {
  relationship: CoachingRelationship;
}) {
  const { refreshSession, signOut } = useAuth();
  const steps = checklistFor(relationship);

  return (
    <Screen
      title="Waiting for your plan"
      subtitle="Your coach is reviewing your intake. You can set up reminders while you wait."
    >
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Rahul is preparing your plan</Text>
        <Text style={styles.bannerBody}>
          We'll notify you when your coaching plan is ready. Pull to refresh or
          tap below to check status.
        </Text>
      </View>

      <View style={styles.checklist}>
        {steps.map((step) => (
          <Text
            key={step.label}
            style={[styles.checkItem, step.done ? styles.checkDone : null]}
          >
            {step.done ? "✓" : "○"} {step.label}
          </Text>
        ))}
      </View>

      <Text style={styles.meanwhile}>Meanwhile</Text>
      <Text style={styles.hint}>
        • Set up reminders so logging is easy once your plan goes live{"\n"}
        • Message your coach on WhatsApp if you have a quick question
      </Text>

      <PrimaryButton
        label="Refresh status"
        onPress={() => {
          void refreshSession();
        }}
      />
      <PrimaryButton label="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.paleLavender,
    borderRadius: 12,
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
});
