import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { Text } from "./Text";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";

type Props = {
  title: string;
  subtitle?: string;
  /** Leading icon in a 32 pt fill tile; receives the icon colour (ink2). */
  icon?: (color: string) => ReactNode;
  /** Trailing value text (ink3), e.g. "On" or "Wed 21 Oct". */
  value?: string;
  /** Trailing element after the value (a Switch, a chip). */
  trailing?: ReactNode;
  /** Chevron; defaults to shown when the row is pressable. */
  chevron?: boolean;
  /** Destructive row (kit `.li.danger`): crit title. */
  danger?: boolean;
  /** Hairline above the row, inset past the icon (kit `.li + .li`). Set on every row but the first. */
  divider?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * Kit `.li`: a 52 pt list row for a `Card variant="group"`. Neutral icon tile
 * (fill with an ink2 icon), ink title, ink3 trailing value, ink4 chevron,
 * line dividers.
 */
export function ListRow({
  title,
  subtitle,
  icon,
  value,
  trailing,
  chevron,
  danger = false,
  divider = false,
  onPress,
  disabled = false,
  accessibilityLabel,
  testID,
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const showChevron = chevron ?? Boolean(onPress);
  const content = (
    <>
      {divider ? (
        <View style={[styles.divider, icon ? styles.dividerInset : null]} />
      ) : null}
      {icon ? (
        <View style={styles.iconTile}>{icon(theme.colors.ink2)}</View>
      ) : null}
      <View style={styles.text}>
        <Text
          variant="body"
          tone={danger ? "crit" : disabled ? "ink4" : "ink"}
          numberOfLines={2}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value || trailing || showChevron ? (
        <View style={styles.trailing}>
          {value ? (
            <Text tone="ink3" style={styles.value} numberOfLines={1}>
              {value}
            </Text>
          ) : null}
          {trailing}
          {showChevron ? (
            <ChevronRight size={18} color={theme.colors.ink4} strokeWidth={2} />
          ) : null}
        </View>
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View testID={testID} style={styles.row}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? (value ? `${title}, ${value}` : title)
      }
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && !disabled ? styles.pressed : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

const useStyles = createThemedStyles((t) => ({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: "relative",
  },
  pressed: {
    backgroundColor: t.colors.fill,
  },
  divider: {
    backgroundColor: t.colors.line,
    height: 0.5,
    left: 14,
    position: "absolute",
    right: 0,
    top: 0,
  },
  dividerInset: {
    left: 58,
  },
  iconTile: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 9,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  text: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  trailing: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  value: {
    fontSize: 15,
  },
}));
