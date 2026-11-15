import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Check } from "lucide-react-native";
import { Text } from "./Text";
import {
  createThemedStyles,
  shadowColor,
  useTheme,
  withAlpha,
} from "../providers/ThemeProvider";

type Props = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  /** Leading check icon (frame 05 Mark reviewed toast). */
  leadingCheck?: boolean;
  leading?: ReactNode;
};

/**
 * Toast (kit `.toast`): navy fill with white text and a white-tint action in
 * both themes (`--navy` is #33333C in dark). Z12-38 builds the shared queue
 * and host on top of this; the call signature stays.
 */
export function Snackbar({
  message,
  actionLabel,
  onAction,
  onDismiss,
  leadingCheck = false,
  leading,
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const leadingNode = leadingCheck ? (
    <Check color={theme.colors.toastOk} size={18} strokeWidth={2.4} />
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
          <View style={styles.actionPill}>
            <Text style={styles.action}>{actionLabel}</Text>
          </View>
        </Pressable>
      ) : null}
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onDismiss}
          style={styles.dismissHit}
        >
          <Text style={styles.dismiss}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  wrap: {
    alignItems: "center",
    backgroundColor: t.colors.navy,
    borderRadius: t.radii.toast,
    flexDirection: "row",
    gap: 10,
    minHeight: 52,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
    shadowColor: shadowColor(t),
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: t.scheme === "dark" ? 0 : 0.28,
    shadowRadius: 13,
    elevation: t.scheme === "dark" ? 0 : 6,
    borderWidth: t.scheme === "dark" ? 1 : 0,
    borderColor: t.colors.edge,
  },
  leading: {
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    color: t.colors.white,
    flex: 1,
    fontSize: 14.5,
    fontWeight: "500",
    lineHeight: 20,
  },
  actionHit: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: t.touchTarget,
  },
  actionPill: {
    backgroundColor: withAlpha(t.colors.white, 0.14),
    borderRadius: 10,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  action: {
    color: t.colors.white,
    fontSize: 14.5,
    fontWeight: "600",
  },
  dismissHit: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: t.touchTarget,
    minWidth: t.touchTarget,
  },
  dismiss: {
    color: t.colors.white,
    fontSize: 16,
  },
}));
