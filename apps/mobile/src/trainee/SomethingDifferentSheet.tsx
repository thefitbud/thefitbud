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
import {
  MINIMAL_PNG_CONTENT_TYPE,
  minimalPngBytes,
} from "../lib/minimalPng";
import { createIdempotencyKey } from "../lib/idempotency";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";

type Props = {
  assignment: MealAssignment;
  relationshipId: string;
  onDone: () => void;
  onCancel: () => void;
};

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
  const [logged, setLogged] = useState<LoggedFoodItem[]>([]);
  const [customName, setCustomName] = useState("");
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

  function addFood(item: TraineeFoodSearchItem) {
    setLogged((prev) => [
      ...prev,
      {
        foodId: item.id,
        servingId: item.defaultServingId ?? undefined,
        quantity: 1,
      },
    ]);
    setResults([]);
    setQuery("");
  }

  function addCustom() {
    const name = customName.trim();
    if (!name) return;
    setLogged((prev) => [
      ...prev,
      {
        customFood: {
          name,
          kcal: 0,
        },
      },
    ]);
    setCustomName("");
  }

  async function uploadMealPhoto(): Promise<string | null> {
    if (!assignment.photoRequired) return null;
    const target = await api.createUploadTarget(
      {
        coachingRelationshipId: relationshipId,
        mediaType: "meal_photo",
        contentType: MINIMAL_PNG_CONTENT_TYPE,
        originalFilename: `meal-${assignment.id}.png`,
      },
      createIdempotencyKey(),
    );
    await api.uploadMediaContent(
      target.mediaAsset.id,
      minimalPngBytes(),
      MINIMAL_PNG_CONTENT_TYPE,
    );
    return target.mediaAsset.id;
  }

  async function save() {
    if (logged.length === 0) {
      setError("Add at least one food, or use Eaten as planned instead.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const mediaAssetId = await uploadMealPhoto();
      const photoIntent = mediaAssetId
        ? {
            notedAt: new Date().toISOString(),
            mediaAssetId,
            contentType: MINIMAL_PNG_CONTENT_TYPE,
            clientRef: `meal-photo-${assignment.id}`,
          }
        : null;
      await enqueueAndPush(sync, {
        recordId: assignment.id,
        operation: "meal.deviate",
        payload: {
          assignmentId: assignment.id,
          body: {
            deviationKind: "logged_foods",
            notes: null,
            photoIntent,
            items: logged,
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
            <Pressable style={styles.row} onPress={() => addFood(item)}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              {item.energyKcalScaled != null ? (
                <Text style={styles.rowMeta}>
                  {Math.round(item.energyKcalScaled / NUTRIENT_SCALE)} kcal
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
      <PrimaryButton label="Add custom" variant="secondary" onPress={addCustom} />
      {logged.length > 0 ? (
        <View style={styles.logged}>
          <Text style={styles.loggedTitle}>Logged ({logged.length})</Text>
          {logged.map((item, index) => (
            <Text key={`${index}`} style={styles.loggedLine}>
              {item.customFood?.name ?? `Food ${item.foodId?.slice(0, 8)}`}
            </Text>
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
    gap: spacing.xs,
    padding: spacing.md,
  },
  loggedTitle: {
    color: colors.deepNavy,
    fontWeight: "600",
  },
  loggedLine: {
    color: colors.darkGrey,
    fontSize: 14,
  },
});
