import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type {
  LoggedFoodItem,
  MealAssignment,
  TraineeFoodSearchResponse,
} from "@fitbud/contracts";
import { NUTRIENT_SCALE } from "@fitbud/contracts";

type TraineeFoodSearchItem = TraineeFoodSearchResponse["items"][number];
import { colors, spacing } from "@fitbud/ui-mobile";
import { stage1Api } from "../lib/stage1Api";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Field } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { MINIMAL_PNG_CONTENT_TYPE } from "../lib/minimalPng";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";
import { uploadMealPhoto } from "./mealActions";

const QUANTITY_CHIPS = [0.5, 1, 1.5, 2, 3];

type Props = {
  assignment: MealAssignment;
  relationshipId: string;
  onDone: () => void;
  onCancel: () => void;
};

type LoggedRow = LoggedFoodItem & { label: string; kcalPreview: number | null };

export function SomethingDifferentSheet({
  assignment,
  relationshipId,
  onDone,
  onCancel,
}: Props) {
  const { api } = useAuth();
  const s1 = stage1Api(api);
  const sync = useSyncEngine();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TraineeFoodSearchItem[]>([]);
  const [logged, setLogged] = useState<LoggedRow[]>([]);
  const [customName, setCustomName] = useState("");
  const [customKcal, setCustomKcal] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const page = await s1.searchMeFoods({ q, limit: 20 });
      setResults(page.items);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Search failed.",
      );
    } finally {
      setLoading(false);
    }
  }, [query, s1]);

  function addFood(item: TraineeFoodSearchItem, quantity = 1) {
    const kcalPreview =
      item.energyKcalScaled != null
        ? Math.round((item.energyKcalScaled / NUTRIENT_SCALE) * quantity)
        : null;
    setLogged((prev) => [
      ...prev,
      {
        foodId: item.id,
        servingId: item.defaultServingId ?? undefined,
        quantity,
        label: item.name,
        kcalPreview,
      },
    ]);
    setResults([]);
    setQuery("");
  }

  function addCustom() {
    const name = customName.trim();
    if (!name) return;
    const kcal = Number.parseInt(customKcal, 10);
    setLogged((prev) => [
      ...prev,
      {
        customFood: {
          name,
          kcal: Number.isFinite(kcal) ? kcal : 0,
        },
        label: name,
        kcalPreview: Number.isFinite(kcal) ? kcal : null,
      },
    ]);
    setCustomName("");
    setCustomKcal("");
  }

  function updateQuantity(index: number, quantity: number) {
    setLogged((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        return { ...row, quantity };
      }),
    );
  }

  async function save() {
    if (logged.length === 0) {
      setError("Add at least one food, or use Eaten as planned instead.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const mediaAssetId = assignment.photoRequired
        ? await uploadMealPhoto(api, relationshipId, assignment)
        : null;
      const photoIntent = mediaAssetId
        ? {
            notedAt: new Date().toISOString(),
            mediaAssetId,
            contentType: MINIMAL_PNG_CONTENT_TYPE,
            clientRef: `meal-photo-${assignment.id}`,
          }
        : null;
      const items: LoggedFoodItem[] = logged.map((row) => {
        if (row.customFood) {
          return { customFood: row.customFood };
        }
        return {
          foodId: row.foodId,
          servingId: row.servingId,
          quantity: row.quantity,
        };
      });
      await enqueueAndPush(sync, {
        recordId: assignment.id,
        operation: "meal.deviate",
        payload: {
          assignmentId: assignment.id,
          body: {
            deviationKind: "logged_foods",
            notes: null,
            photoIntent,
            items,
          },
        },
      });
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not save meal.",
      );
    } finally {
      setSaving(false);
    }
  }

  const macroPreview = logged.reduce(
    (sum, row) => sum + (row.kcalPreview ?? 0),
    0,
  );

  return (
    <Screen
      title="Something different"
      subtitle={`${assignment.mealName} · log what you actually ate`}
    >
      {error ? <ErrorBanner message={error} /> : null}
      <Field
        label="Search foods"
        value={query}
        onChangeText={setQuery}
        placeholder="Search library"
        autoCapitalize="none"
        onSubmitEditing={() => {
          void search();
        }}
      />
      <PrimaryButton
        label="Search"
        variant="secondary"
        loading={loading}
        onPress={() => void search()}
      />
      {results.length > 0 ? (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          style={styles.results}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => addFood(item, 1)}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              {item.energyKcalScaled != null ? (
                <Text style={styles.rowMeta}>
                  {Math.round(item.energyKcalScaled / NUTRIENT_SCALE)} kcal /
                  serving
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      ) : null}
      <Field
        label="Custom item"
        value={customName}
        onChangeText={setCustomName}
        placeholder="Not in library?"
      />
      <Field
        label="Custom kcal (optional)"
        value={customKcal}
        onChangeText={setCustomKcal}
        placeholder="e.g. 420"
        keyboardType="number-pad"
      />
      <PrimaryButton label="Add custom" variant="secondary" onPress={addCustom} />
      {logged.length > 0 ? (
        <View style={styles.logged}>
          <Text style={styles.loggedTitle}>
            Logged ({logged.length}) · ~{macroPreview} kcal
          </Text>
          {logged.map((item, index) => (
            <View key={`${index}`} style={styles.loggedRow}>
              <Text style={styles.loggedLine}>{item.label}</Text>
              <View style={styles.qtyRow}>
                {QUANTITY_CHIPS.map((qty) => (
                  <Pressable
                    key={qty}
                    style={[
                      styles.qtyChip,
                      item.quantity === qty ? styles.qtyChipActive : null,
                    ]}
                    onPress={() => updateQuantity(index, qty)}
                  >
                    <Text
                      style={
                        item.quantity === qty
                          ? styles.qtyChipTextActive
                          : styles.qtyChipText
                      }
                    >
                      {qty}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}
      <PrimaryButton label="Save meal" loading={saving} onPress={() => void save()} />
      <PrimaryButton label="Cancel" variant="ghost" onPress={onCancel} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  results: {
    maxHeight: 160,
    marginTop: spacing.sm,
  },
  row: {
    backgroundColor: colors.white,
    borderRadius: 8,
    marginBottom: spacing.xs,
    padding: spacing.md,
  },
  rowTitle: {
    color: colors.deepNavy,
    fontWeight: "600",
  },
  rowMeta: {
    color: colors.midGrey,
    fontSize: 12,
  },
  logged: {
    backgroundColor: colors.paleLavender,
    borderRadius: 12,
    gap: spacing.sm,
    padding: spacing.md,
  },
  loggedTitle: {
    color: colors.deepNavy,
    fontWeight: "600",
  },
  loggedRow: {
    gap: spacing.xs,
  },
  loggedLine: {
    color: colors.darkGrey,
    fontSize: 14,
    fontWeight: "600",
  },
  qtyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  qtyChip: {
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  qtyChipActive: {
    backgroundColor: colors.indigo,
  },
  qtyChipText: {
    color: colors.deepNavy,
    fontSize: 13,
  },
  qtyChipTextActive: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "600",
  },
});
