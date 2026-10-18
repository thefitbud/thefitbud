import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { colors, radii, spacing, touchTargetMin } from "@fitbud/ui-mobile";
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

const styles = StyleSheet.create({
  trigger: {
    minWidth: touchTargetMin,
    minHeight: touchTargetMin,
    alignItems: "center",
    justifyContent: "center",
  },
  triggerLabel: {
    fontSize: 22,
    color: colors.deepNavy,
    fontWeight: "600",
  },
  list: {
    gap: spacing.xs,
  },
  item: {
    minHeight: touchTargetMin,
    justifyContent: "center",
    paddingVertical: spacing.sm,
    borderRadius: radii.control,
  },
  itemLabel: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "500",
  },
  destructive: {
    color: colors.error,
  },
});
