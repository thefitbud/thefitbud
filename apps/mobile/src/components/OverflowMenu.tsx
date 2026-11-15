import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./Text";
import { createThemedStyles } from "../providers/ThemeProvider";
import { BottomSheet } from "./BottomSheet";

export type OverflowMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

type Props = {
  items: OverflowMenuItem[];
  label?: string;
};

/** Mobile ⋯ overflow as a bottom sheet. */
export function OverflowMenu({ items, label = "More actions" }: Props) {
  const [open, setOpen] = useState(false);
  const styles = useStyles();

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        style={styles.trigger}
      >
        <Text style={styles.triggerLabel}>⋯</Text>
      </Pressable>
      <BottomSheet
        visible={open}
        title={label}
        onDismiss={() => setOpen(false)}
      >
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ disabled: item.disabled }}
              disabled={item.disabled}
              onPress={() => {
                setOpen(false);
                item.onSelect();
              }}
              style={styles.item}
            >
              <Text
                style={[
                  styles.itemLabel,
                  item.destructive ? styles.destructive : null,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </BottomSheet>
    </>
  );
}

const useStyles = createThemedStyles((t) => ({
  trigger: {
    minWidth: t.touchTarget,
    minHeight: t.touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  triggerLabel: {
    fontSize: 22,
    color: t.colors.ink,
    fontWeight: "600",
  },
  list: {
    gap: t.spacing.xs,
  },
  item: {
    minHeight: t.touchTarget,
    justifyContent: "center",
    paddingVertical: t.spacing.sm,
    borderRadius: t.radii.input,
  },
  itemLabel: {
    ...t.text.body.style,
    color: t.colors.ink,
    fontWeight: "500",
  },
  destructive: {
    color: t.colors.crit,
  },
}));
