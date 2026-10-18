import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "../../components/Text";
import type { FitBudApiClient } from "@fitbud/api-client";
import type { TraineeFoodSearchResponse } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { loadServingPresetsForFood } from "./foodServingsApi";
import type { ServingPresetV2 } from "./servingPresetsV2";

type FoodItem = TraineeFoodSearchResponse["items"][number];

type Props = {
  api: FitBudApiClient;
  item: FoodItem;
  onSelect: (
    item: FoodItem,
    quantity: number,
    servingId?: string,
  ) => void;
};

export function FoodServingChips({ api, item, onSelect }: Props) {
  const [presets, setPresets] = useState<ServingPresetV2[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const rows = await loadServingPresetsForFood(api, item);
      if (!cancelled) {
        setPresets(rows);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, item.id]);

  if (loading) {
    return <Text style={styles.loading}>Loading servings…</Text>;
  }

  return (
    <View style={styles.servingRow}>
      {presets.map((preset) => (
        <Pressable
          key={preset.id}
          style={styles.servingChip}
          onPress={() =>
            onSelect(item, preset.quantity, preset.servingId ?? item.defaultServingId ?? undefined)
          }
        >
          <Text style={styles.servingChipText}>{preset.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    color: colors.midGrey,
    fontSize: 12,
  },
  servingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  servingChip: {
    backgroundColor: colors.paleLavender,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  servingChipText: {
    color: colors.deepNavy,
    fontSize: 12,
    fontWeight: "600",
  },
});
