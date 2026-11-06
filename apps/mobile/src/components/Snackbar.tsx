import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";
import { Text } from "./Text";
import { colors, spacing } from "@fitbud/ui-mobile";

type Props = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  /** Leading check icon (frame 05 Mark reviewed toast). */
  leadingCheck?: boolean;
  leading?: ReactNode;
};

export function Snackbar({
  message,
  actionLabel,
  onAction,
  onDismiss,
  leadingCheck = false,
  leading,
}: Props) {
  const leadingNode = leadingCheck ? (
    <Check color={colors.white} size={18} strokeWidth={2.4} />
  ) : (
    leading
  );

  return (
    <View style={styles.wrap} accessibilityRole="text">
      {leadingNode ? <View style={styles.leading}>{leadingNode}</View> : null}
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={styles.actionHit}
        >
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
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    minHeight: 52,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
  },
  leading: {
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    color: colors.white,
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  actionHit: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
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
