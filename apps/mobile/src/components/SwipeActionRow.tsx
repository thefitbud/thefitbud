import { useRef, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { Swipeable } from "react-native-gesture-handler";
import { colors, spacing } from "@fitbud/ui-mobile";

type Props = {
  children: ReactNode;
  onMarkReviewed: () => void;
  onNudge: () => void;
  markLabel?: string;
  nudgeLabel?: string;
};

export function SwipeActionRow({
  children,
  onMarkReviewed,
  onNudge,
  markLabel = "Mark reviewed",
  nudgeLabel = "Nudge",
}: Props) {
  const swipeRef = useRef<Swipeable>(null);

  const renderLeft = () => (
    <Pressable
      accessibilityRole="button"
      style={styles.leftAction}
      onPress={() => {
        swipeRef.current?.close();
        onMarkReviewed();
      }}
    >
      <Text style={styles.leftActionText}>{markLabel}</Text>
    </Pressable>
  );

  const renderRight = () => (
    <Pressable
      accessibilityRole="button"
      style={styles.rightAction}
      onPress={() => {
        swipeRef.current?.close();
        onNudge();
      }}
    >
      <Text style={styles.rightActionText}>{nudgeLabel}</Text>
    </Pressable>
  );

  if (Platform.OS === "web") {
    return <View>{children}</View>;
  }

  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      overshootFriction={8}
      renderLeftActions={renderLeft}
      renderRightActions={renderRight}
    >
      {children}
    </Swipeable>
  );
}

const ACTION_WIDTH = 112;

const styles = StyleSheet.create({
  leftAction: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    justifyContent: "center",
    marginVertical: spacing.xs,
    width: ACTION_WIDTH,
  },
  leftActionText: {
    color: colors.indigo,
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: spacing.sm,
    textAlign: "center",
  },
  rightAction: {
    alignItems: "center",
    backgroundColor: colors.indigo,
    justifyContent: "center",
    marginVertical: spacing.xs,
    width: ACTION_WIDTH,
  },
  rightActionText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: spacing.sm,
    textAlign: "center",
  },
});
