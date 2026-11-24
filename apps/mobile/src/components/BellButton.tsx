import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Bell } from "lucide-react-native";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";

/** The bell's accessibility label: "Notifications" or "Notifications, 3 unread". */
export function bellLabel(unread: number): string {
  return unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
}

/**
 * The notifications bell: a 44 pt target with one unread dot on every tab
 * (TR-15a, kit `.circbtn .dot`): `coralStrong` with a 2 pt card ring. Coral
 * means new, never an error.
 */
export function BellButton({
  unread = 0,
  onPress,
  style,
  testID,
}: {
  unread?: number;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bellLabel(unread)}
      onPress={onPress}
      style={[styles.button, style]}
      testID={testID}
    >
      <Bell
        size={22}
        color={theme.colors.ink}
        strokeWidth={1.75}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      {unread > 0 ? <View style={styles.dot} testID="bell-unread-dot" /> : null}
    </Pressable>
  );
}

const useStyles = createThemedStyles((t) => ({
  button: {
    alignItems: "center",
    height: t.touchTarget,
    justifyContent: "center",
    position: "relative",
    width: t.touchTarget,
  },
  dot: {
    backgroundColor: t.colors.coralStrong,
    borderColor: t.colors.card,
    borderRadius: 6,
    borderWidth: 2,
    height: 12,
    position: "absolute",
    right: 8,
    top: 8,
    width: 12,
  },
}));
