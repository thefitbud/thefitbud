import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Badge } from "./Badge";
import { Text } from "./Text";
import {
  createThemedStyles,
  shadowColor,
  useTheme,
} from "../providers/ThemeProvider";

export type TabBarItem<K extends string> = {
  key: K;
  label: string;
  /** Icon; receives the tab's colour (brand when active, ink2 otherwise). */
  icon: (color: string) => ReactNode;
  /** Unread count, or "dot" for a plain notification dot. */
  badge?: number | "dot";
  testID?: string;
};

type Props<K extends string> = {
  items: ReadonlyArray<TabBarItem<K>>;
  activeKey: K;
  onSelect: (key: K) => void;
  /** The shell positions the bar (the kit floats it 16 pt from the sides, 22 pt from the bottom). */
  style?: StyleProp<ViewStyle>;
};

/**
 * Kit `.tabbar`: a 62 pt glass capsule. The active tab is a brand-tint pill
 * with a brand icon and label; inactive tabs are ink2. Badges are coral with
 * a navy numeral. Each tab announces its name, selection and unread count.
 */
export function TabBar<K extends string>({
  items,
  activeKey,
  onSelect,
  style,
}: Props<K>) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View accessibilityRole="tablist" style={[styles.bar, style]}>
      {items.map((item) => {
        const active = item.key === activeKey;
        const color = active ? theme.colors.brand : theme.colors.ink2;
        const unread =
          typeof item.badge === "number" && item.badge > 0
            ? `, ${item.badge} unread`
            : item.badge === "dot"
              ? ", new"
              : "";
        return (
          <Pressable
            key={item.key}
            testID={item.testID}
            accessibilityRole="tab"
            accessibilityLabel={`${item.label}${unread}`}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(item.key)}
            style={[styles.tab, active ? styles.tabActive : null]}
          >
            <View style={styles.iconWrap}>
              {item.icon(color)}
              {item.badge === "dot" ? (
                <Badge dot style={styles.dot} />
              ) : typeof item.badge === "number" ? (
                <Badge count={item.badge} style={styles.badge} />
              ) : null}
            </View>
            <Text variant="tab" style={{ color }} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  bar: {
    backgroundColor: t.colors.glass,
    borderRadius: t.radii.tabCapsule,
    borderWidth: t.scheme === "dark" ? 1 : 0.5,
    borderColor: t.scheme === "dark" ? t.colors.edge : t.colors.line,
    flexDirection: "row",
    height: 62,
    marginHorizontal: 16,
    padding: 5,
    shadowColor: shadowColor(t),
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: t.scheme === "dark" ? 0 : 0.14,
    shadowRadius: 14,
    elevation: t.scheme === "dark" ? 0 : 8,
  },
  tab: {
    alignItems: "center",
    borderRadius: t.radii.tab,
    flex: 1,
    gap: 3,
    justifyContent: "center",
  },
  tabActive: {
    backgroundColor: t.colors.brandTint,
  },
  iconWrap: {
    position: "relative",
  },
  badge: {
    left: 14,
    position: "absolute",
    top: -7,
  },
  dot: {
    position: "absolute",
    right: -6,
    top: -3,
  },
}));
