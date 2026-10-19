import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type { TraineeFoodSearchResponse } from "@fitbud/contracts";

type TraineeFoodSearchItem = TraineeFoodSearchResponse["items"][number];
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import { formatKcal } from "@fitbud/core";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
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
  mealTitle?: string;
};

export function FoodSearchScreen({ onBack, onSelect, mealTitle }: Props) {
  const { api } = useAuth();
  const s1 = stage1Api(api);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TraineeFoodSearchItem[]>([]);
  const [suggestions, setSuggestions] = useState<TraineeFoodSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const loadSuggestions = useCallback(async () => {
    try {
      const page = await s1.searchMeFoods({ q: "dal", limit: 8 });
      setSuggestions(page.items);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [s1]);

  useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions]);

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
      setOffline(false);
    } catch (err) {
      setOffline(true);
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Search failed. Showing foods saved on your phone if available.",
      );
    } finally {
      setLoading(false);
    }
  }, [query, s1]);

  const list = results.length > 0 ? results : suggestions;
  const emptyCopy =
    query.trim().length >= 2 && !loading
      ? `Can't find '${query.trim()}'? Add it as a custom food — it's fine to log it anyway.`
      : "Recent and plan foods appear here. Search for dal, roti, poha…";

  return (
    <Screen
      title={mealTitle ? `Log · ${mealTitle}` : "Food search"}
      subtitle="Search foods, e.g. dal, roti, poha"
      refreshing={loading}
      onRefresh={() => {
        void (query.trim().length >= 2 ? search() : loadSuggestions());
      }}
    >
      {error ? <ErrorBanner message={error} /> : null}
      {offline ? (
        <Text style={styles.offline}>Showing foods saved on your phone</Text>
      ) : null}
      <Field
        label="Search"
        value={query}
        onChangeText={setQuery}
        placeholder="Search foods, e.g. dal, roti, poha"
        autoCapitalize="none"
        onSubmitEditing={() => {
          void search();
        }}
      />
      <PrimaryButton
        label="Search"
        loading={loading}
        onPress={() => void search()}
      />
      {results.length === 0 && suggestions.length > 0 ? (
        <Text style={styles.section}>From your plan · frequent</Text>
      ) : null}
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        style={styles.list}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.muted}>{emptyCopy}</Text>
          ) : (
            <Text style={styles.muted}>Searching…</Text>
          )
        }
        renderItem={({ item }) => {
          const kcal =
            item.energyKcalScaled != null
              ? Math.round(item.energyKcalScaled / NUTRIENT_SCALE)
              : null;
          const unknown = item.energyKcalScaled == null;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Select ${item.name}`}
              style={styles.row}
              onPress={() => onSelect?.(item)}
            >
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {kcal != null
                  ? formatKcal(kcal, unknown)
                  : "≥ nutrition unknown"}
                {item.defaultServingId ? " · default serving" : ""}
              </Text>
              <FoodServingChips
                api={api}
                item={item}
                onSelect={(food) => {
                  onSelect?.(food);
                }}
              />
            </Pressable>
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
    maxHeight: 420,
  },
  section: {
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "700",
    marginTop: spacing.lg,
  },
  muted: {
    color: colors.midGrey,
    fontSize: 14,
    marginTop: spacing.lg,
    lineHeight: 20,
  },
  offline: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  row: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: radii.card,
    borderWidth: 1,
    marginBottom: spacing.sm,
    minHeight: 44,
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
