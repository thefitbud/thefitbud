import { Platform, Pressable } from "react-native";
import { ArrowLeft, ChevronLeft } from "lucide-react-native";
import { Text } from "./Text";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";

/**
 * Z14-18: the one header back control for every pushed screen (BK-01).
 *
 * iOS (and web): a chevron and the parent's short name ("Attention",
 * "Rohan"), or "Back" when the parent is not known. Android: a back arrow
 * with no visible label; screen readers hear "Back" on both. At least 44 x 44
 * pt. The on-screen back and the hardware back call the same function.
 */
export type HeaderBackProps = {
  onPress: () => void;
  /** The parent's short name. Shown on iOS only; defaults to "Back". */
  label?: string | null;
  testID?: string;
};

/** Minimum touch target (pt), both ways. */
export const HEADER_BACK_TARGET = 44;

/** Width of the left and right slots that keep a centred title centred. */
export const HEADER_BACK_SLOT = Platform.OS === "android" ? HEADER_BACK_TARGET : 104;

export function backLabel(label: string | null | undefined): string {
  const trimmed = label?.trim();
  return trimmed ? trimmed : "Back";
}

export function HeaderBack({ onPress, label, testID }: HeaderBackProps) {
  const styles = useStyles();
  const theme = useTheme();
  const android = Platform.OS === "android";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onPress}
      testID={testID ?? "header-back"}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 8 }}
      style={[styles.hit, android ? styles.hitAndroid : null]}
    >
      {android ? (
        <ArrowLeft color={theme.colors.ink} size={24} strokeWidth={2.2} />
      ) : (
        <>
          <ChevronLeft color={theme.colors.ink} size={26} strokeWidth={2.2} />
          <Text style={styles.label} numberOfLines={1}>
            {backLabel(label)}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const useStyles = createThemedStyles((t) => ({
  hit: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 2,
    height: HEADER_BACK_TARGET,
    maxWidth: 160,
    minWidth: HEADER_BACK_TARGET,
    paddingRight: 8,
  },
  hitAndroid: { justifyContent: "center", paddingRight: 0, width: HEADER_BACK_TARGET },
  label: { color: t.colors.ink, fontSize: 17, lineHeight: 22 },
}));
