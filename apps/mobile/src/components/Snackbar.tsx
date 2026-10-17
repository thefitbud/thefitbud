import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@fitbud/ui-mobile";

type Props = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
};

export function Snackbar({ message, actionLabel, onAction, onDismiss }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
      {onDismiss ? (
        <Pressable accessibilityRole="button" onPress={onDismiss}>
          <Text style={styles.dismiss}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    backgroundColor: colors.deepNavy,
    borderRadius: 12,
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  message: {
    color: colors.white,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  action: {
    color: "#A5B4FC",
    fontSize: 14,
    fontWeight: "700",
  },
  dismiss: {
    color: colors.midGrey,
    fontSize: 16,
    paddingHorizontal: spacing.xs,
  },
});
