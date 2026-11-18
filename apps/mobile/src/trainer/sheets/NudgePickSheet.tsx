import { useState } from "react";
import { Pressable, View } from "react-native";
import { Check } from "lucide-react-native";
import { Button } from "../../components/Button";
import { Text } from "../../components/Text";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import { firstNameOf } from "./exceptionSheetContent";
import type { NudgeTarget } from "./nudgeContent";

export type NudgePickItem = {
  id: string;
  /** "Missed workouts" */
  title: string;
  /** "Tue, Thu · critical" */
  detail: string;
  target: NudgeTarget;
};

type Props = {
  traineeDisplayName: string;
  items: NudgePickItem[];
  onNext: (target: NudgeTarget) => void;
};

/**
 * TM-03j: pick the one open item a nudge is about. The push opens it. This is
 * the first step inside `NudgeSheet`'s own sheet, not a sheet of its own: iOS
 * cannot present a second modal while the first is still leaving.
 */
export function NudgePickContent({ traineeDisplayName, items, onNext }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const [selected, setSelected] = useState<string | null>(items[0]?.id ?? null);
  const first = firstNameOf(traineeDisplayName) || "your client";
  const chosen = items.find((item) => item.id === selected) ?? null;
  return (
    <>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          {`Nudge ${first} about…`}
        </Text>
        <Text variant="subhead">Pick one open item. The push opens it.</Text>
      </View>
      <View style={styles.group}>
        {items.map((item, index) => {
          const on = item.id === selected;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${item.title}, ${item.detail}`}
              onPress={() => setSelected(item.id)}
              style={[styles.row, index > 0 ? styles.rowDivider : null]}
              testID={`nudge-pick-${item.id}`}
            >
              <View style={styles.rowText}>
                <Text variant="body">{item.title}</Text>
                <Text variant="subhead">{item.detail}</Text>
              </View>
              <View style={[styles.radio, on ? styles.radioOn : null]}>
                {on ? <Check size={16} color={theme.colors.onBrand} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Button
        label="Next"
        disabled={!chosen}
        onPress={() => {
          if (chosen) onNext(chosen.target);
        }}
        testID="nudge-pick-next"
      />
    </>
  );
}

const useStyles = createThemedStyles((t) => ({
  head: { gap: t.spacing.xs },
  group: {
    backgroundColor: t.colors.fill,
    borderRadius: t.radii.group,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: t.spacing.md,
    minHeight: 64,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.md,
  },
  rowDivider: { borderTopColor: t.colors.line2, borderTopWidth: 1 },
  rowText: { flex: 1, gap: 2 },
  radio: {
    alignItems: "center",
    borderColor: t.colors.ink4,
    borderRadius: 14,
    borderWidth: 2,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  radioOn: { backgroundColor: t.colors.ink, borderColor: t.colors.ink },
}));
