import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../../auth/AuthProvider";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";

type Props = {
  onBack: () => void;
  onChangePassword: () => void;
};

export function ProfileScreen({ onBack, onChangePassword }: Props) {
  const { me } = useAuth();

  return (
    <Screen title="Profile" subtitle="Your account details.">
      <View style={styles.stack}>
        <View style={styles.row}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{me?.email ?? "Not set"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Timezone</Text>
          <Text style={styles.value}>{me?.timezone ?? "—"}</Text>
        </View>
        <PrimaryButton label="Change password" onPress={onChangePassword} />
        <PrimaryButton label="Back" variant="ghost" onPress={onBack} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  row: {
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
  },
});
