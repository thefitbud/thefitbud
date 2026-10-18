import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "../../components/Text";
import { colors, spacing } from "@fitbud/ui-mobile";

export function SettingsRow({
  label,
  hint,
  onPress,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.row}
    >
      <View style={styles.main}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: 12,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  main: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
  hint: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
  },
  chevron: {
    color: colors.midGrey,
    fontSize: 22,
    fontWeight: "300",
  },
});
