import { useRef, type ReactNode } from "react";
import { Platform, Pressable, View } from "react-native";
import { Check } from "lucide-react-native";
import { Text } from "./Text";
import { Swipeable } from "react-native-gesture-handler";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";

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
  const theme = useTheme();
  const styles = useStyles();
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
      <Check color={theme.colors.onBrand} size={22} strokeWidth={2.4} />
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

/** Done action: --done fill with an on-brand tick and label (green means done). */
const useStyles = createThemedStyles((t) => ({
  rightAction: {
    alignItems: "center",
    backgroundColor: t.colors.done,
    gap: 4,
    justifyContent: "center",
    width: ACTION_WIDTH,
  },
  rightActionText: {
    color: t.colors.onBrand,
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: t.spacing.sm,
    textAlign: "center",
  },
}));
