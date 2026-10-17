import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typeScale } from "@fitbud/ui-mobile";
import { useSyncEngine } from "../sync/SyncProvider";

type Props = {
  onPress?: () => void;
};

export function SyncIndicator({ onPress }: Props) {
  const sync = useSyncEngine();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      const rows = await sync.store.listPendingOutbox();
      if (active) setPending(rows.length);
    })();
    return () => {
      active = false;
    };
  }, [sync]);

  if (pending === 0) {
    return null;
  }

  const label = "Saved on phone";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.wrap}
    >
      <View style={[styles.dot, styles.dotNeutral]} />
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  dot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  dotNeutral: {
    backgroundColor: colors.midGrey,
  },
  dotProblem: {
    backgroundColor: colors.warning,
  },
  text: {
    color: colors.midGrey,
    fontSize: typeScale.caption,
    fontWeight: "500",
  },
});
