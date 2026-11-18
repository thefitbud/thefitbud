import { ActivityIndicator, Pressable, View } from "react-native";
import { Text } from "../../components/Text";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";

type Props = {
  title: string;
  subtitle?: string;
  leftLabel?: string;
  onLeft: () => void;
  rightLabel: string;
  onRight: () => void;
  rightDisabled?: boolean;
  busy?: boolean;
};

/**
 * The kit's modal nav bar (TR-26a–e, TR-08b/c): Cancel, a two-line title, and
 * the screen's own action on the right (Save, Add). A disabled action reads
 * in ink4 and is announced as disabled, not shown by colour alone.
 */
export function FoodNavHeader({
  title,
  subtitle,
  leftLabel = "Cancel",
  onLeft,
  rightLabel,
  onRight,
  rightDisabled = false,
  busy = false,
}: Props) {
  const styles = useStyles();
  const theme = useTheme();
  const disabled = rightDisabled || busy;
  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={leftLabel}
        onPress={onLeft}
        style={styles.side}
      >
        <Text variant="body" numberOfLines={1}>
          {leftLabel}
        </Text>
      </Pressable>
      <View style={styles.center}>
        <Text variant="headline" style={styles.centerText} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="ink2" style={styles.centerText} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={rightLabel}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onRight}
        style={[styles.side, styles.sideRight]}
      >
        {busy ? (
          <ActivityIndicator color={theme.colors.ink} />
        ) : (
          <Text variant="bodyStrong" tone={disabled ? "ink4" : "ink"} numberOfLines={1}>
            {rightLabel}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  bar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  side: {
    justifyContent: "center",
    minHeight: t.touchTarget,
    minWidth: 64,
  },
  sideRight: { alignItems: "flex-end" },
  center: { alignItems: "center", flex: 1, minWidth: 0 },
  centerText: { textAlign: "center" },
}));
