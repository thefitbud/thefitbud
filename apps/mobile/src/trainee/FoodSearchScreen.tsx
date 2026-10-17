import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type { TraineeFoodSearchResponse } from "@fitbud/contracts";

type TraineeFoodSearchItem = TraineeFoodSearchResponse["items"][number];
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { stage1Api } from "../lib/stage1Api";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Field } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { FoodServingChips } from "./food/FoodServingChips";

type Props = {
  onBack: () => void;
  onSelect?: (item: TraineeFoodSearchItem) => void;
};

export function FoodSearchScreen({ onBack, onSelect }: Props) {
  const { api } = useAuth();
  const s1 = stage1Api(api);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TraineeFoodSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) {
      setError("Type at least 2 characters.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const page = await s1.searchMeFoods({ q, limit: 30 });
      setResults(page.items);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Search failed.",
      );
    } finally {
      setLoading(false);
    }
  }, [query, s1]);

  return (
    <Screen title="Food search" subtitle="Find foods from your coach's library.">
      {error ? <ErrorBanner message={error} /> : null}
      <Field
        label="Search"
        value={query}
        onChangeText={setQuery}
        placeholder="Dal, roti, chicken…"
        autoCapitalize="none"
        onSubmitEditing={() => {
          void search();
        }}
      />
      <PrimaryButton label="Search" loading={loading} onPress={() => void search()} />
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        style={styles.list}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.muted}>Results appear here.</Text>
          ) : null
        }
        renderItem={({ item }) => {
          const kcal =
            item.energyKcalScaled != null
              ? Math.round(item.energyKcalScaled / NUTRIENT_SCALE)
              : null;
          return (
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {kcal != null ? `${kcal} kcal / serving` : "Nutrition unknown"}
                {item.defaultServingId ? " · default serving" : ""}
              </Text>
              <FoodServingChips
                api={api}
                item={item}
                onSelect={(food) => {
                  onSelect?.(food);
                }}
              />
            </View>
          );
        }}
      />
      <PrimaryButton label="Close" variant="ghost" onPress={onBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: spacing.lg,
    maxHeight: 360,
  },
  muted: {
    color: colors.midGrey,
    fontSize: 14,
    marginTop: spacing.lg,
  },
  row: {
    backgroundColor: colors.white,
    borderRadius: 10,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  name: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "600",
  },
  meta: {
    color: colors.midGrey,
    fontSize: 13,
    marginTop: 2,
  },
});
