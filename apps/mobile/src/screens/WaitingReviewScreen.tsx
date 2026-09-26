import type { CoachingRelationship } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/AuthProvider";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";

export function WaitingReviewScreen({
  relationship,
}: {
  relationship: CoachingRelationship;
}) {
  const { refreshSession, signOut } = useAuth();

  return (
    <Screen
      title="Intake submitted"
      subtitle="Your trainer will review your answers and mark you coaching-ready."
    >
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Waiting for trainer review</Text>
        <Text style={styles.bannerBody}>
          Status: {relationship.onboardingStatus.replace(/_/g, " ")}. Refresh
          after your trainer completes onboarding review.
        </Text>
      </View>
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
    backgroundColor: "#D1FAE5",
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  bannerTitle: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "600",
  },
  bannerBody: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
});
