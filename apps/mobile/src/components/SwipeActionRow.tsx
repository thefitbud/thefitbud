import { useRef, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";
import { Text } from "./Text";
import { Swipeable } from "react-native-gesture-handler";
import { colors, semanticColors, spacing } from "@fitbud/ui-mobile";

type Props = {
  children: ReactNode;
  onMarkReviewed: () => void;
  markLabel?: string;
};

/**
 * Swipe left to Mark reviewed (v3 Needs you). Opening the right action
 * commits; the revealed button is a fallback tap target.
 */
export function SwipeActionRow({
  children,
  onMarkReviewed,
  markLabel = "Mark reviewed",
}: Props) {
  const swipeRef = useRef<Swipeable>(null);
  const committed = useRef(false);

  function commitMarkReviewed() {
    if (committed.current) return;
    committed.current = true;
    swipeRef.current?.close();
    onMarkReviewed();
  }

  const renderRight = () => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={markLabel}
      style={styles.rightAction}
      onPress={commitMarkReviewed}
    >
      <Check color={colors.white} size={22} strokeWidth={2.4} />
      <Text style={styles.rightActionText}>{markLabel}</Text>
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
      rightThreshold={40}
      renderRightActions={renderRight}
      onSwipeableOpen={(direction) => {
        if (direction === "right") commitMarkReviewed();
      }}
      onSwipeableClose={() => {
        committed.current = false;
      }}
    >
      {children}
    </Swipeable>
  );
}

const ACTION_WIDTH = 132;

const styles = StyleSheet.create({
  rightAction: {
    alignItems: "center",
    backgroundColor: semanticColors.positive.text,
    gap: 4,
    justifyContent: "center",
    width: ACTION_WIDTH,
  },
  rightActionText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: spacing.sm,
    textAlign: "center",
  },
});
