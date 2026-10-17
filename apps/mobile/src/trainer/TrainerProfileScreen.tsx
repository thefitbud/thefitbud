import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";

type Props = {
  onBack: () => void;
  onChangePassword?: () => void;
};

export function TrainerProfileScreen({ onBack, onChangePassword }: Props) {
  const { me } = useAuth();
  const profile = me?.trainerProfile;

  return (
    <Screen title="Profile" subtitle="Your coach account on FitBud.">
      <View style={styles.stack}>
        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>
            {profile?.displayName ?? "Coach"}
          </Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{me?.email ?? "—"}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>WhatsApp</Text>
          <Text style={styles.value}>
            {profile?.whatsappE164 ?? "Not set"}
          </Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Timezone</Text>
          <Text style={styles.value}>{me?.timezone ?? "—"}</Text>
        </View>
        {onChangePassword ? (
          <PrimaryButton
            label="Change password"
            variant="secondary"
            onPress={onChangePassword}
          />
        ) : null}
        <PrimaryButton label="Done" variant="ghost" onPress={onBack} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  label: {
    color: colors.midGrey,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  value: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "500",
  },
});
