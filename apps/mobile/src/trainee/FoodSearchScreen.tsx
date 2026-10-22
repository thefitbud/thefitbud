import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import {
  ChevronLeft,
  Minus,
  Plus,
  Search,
  X,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type { LoggedFoodItem, MealAssignment } from "@fitbud/contracts";
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import { formatKcal, formatNumber } from "@fitbud/core";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { weekdayShort } from "../lib/dates";
import { plannedRowsFromAssignment } from "../lib/plannedMealItems";
import { stage1Api } from "../lib/stage1Api";
import { useSyncEngine } from "../sync/SyncProvider";
import { deviateMealAssignment, MealSyncError } from "./mealActions";
import { invalidateRelationshipDayData } from "./dataCache";
import { nutrientsFromMealPrescription } from "./nutrition";
import { cleanFoodLabel } from "./mealHelpers";
import { loadServingPresetsForFood } from "./food/foodServingsApi";
import type { TraineeFoodSearchResponse } from "@fitbud/contracts";

type TraineeFoodSearchItem = TraineeFoodSearchResponse["items"][number];

type LogLine = {
  key: string;
  name: string;
  quantity: number;
  /** Kcal per one unit of quantity. */
  kcalPerUnit: number | null;
  unitLabel: string;
  subtitle: string;
  item: LoggedFoodItem;
};

type Props = {
  assignment: MealAssignment;
  relationshipId: string;
  coachName?: string;
  onBack: () => void;
  onSaved: () => void;
};

function itemKcal(item: TraineeFoodSearchItem): number | null {
  if (item.energyKcalScaled == null) return null;
  return Math.round(item.energyKcalScaled / NUTRIENT_SCALE);
}

function unitFromLabel(label: string | undefined): string {
  const raw = label?.trim() || "serving";
  const parts = raw.split(/\s+/);
  if (parts.length >= 2 && /^[\d½¾¼⅓⅔]+/.test(parts[0] ?? "")) {
    return parts.slice(1).join(" ");
  }
  return raw;
}

export function FoodSearchScreen({
  assignment,
  relationshipId,
  onBack,
  onSaved,
}: Props) {
  const { api, me } = useAuth();
  const sync = useSyncEngine();
  const s1 = stage1Api(api);
  const timeZone = me?.timezone ?? "UTC";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TraineeFoodSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<LogLine[]>(() =>
    plannedRowsFromAssignment(assignment).map((row, index) => ({
      key: `plan-${index}`,
      name: cleanFoodLabel(row.label),
      quantity: row.quantity,
      kcalPerUnit:
        row.kcalPreview != null && row.quantity > 0
          ? row.kcalPreview / row.quantity
          : null,
      unitLabel: row.unitLabel || "serving",
      subtitle: "from your plan",
      item: row.foodId
        ? {
            foodId: row.foodId,
            servingId: row.servingId,
            quantity: row.quantity,
          }
        : {
            customFood: {
              name: row.label,
              kcal: row.kcalPreview ?? 0,
            },
          },
    })),
  );
  const [saving, setSaving] = useState(false);

  const planKcal = nutrientsFromMealPrescription(assignment).kcal;
  const weekday = weekdayShort(timeZone, assignment.localDate);
  const planBrowse = useMemo(
    () => plannedRowsFromAssignment(assignment),
    [assignment],
  );
  const showPlanBrowse = query.trim().length < 2;

  const search = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const page = await s1.searchMeFoods({ q: trimmed, limit: 30 });
        setResults(page.items);
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : "Search failed. Try again.",
        );
      } finally {
        setLoading(false);
      }
    },
    [s1],
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      void search(query);
    }, 280);
    return () => clearTimeout(handle);
  }, [query, search]);

  const totals = useMemo(() => {
    let kcal = 0;
    let unknown = false;
    for (const line of logLines) {
      if (line.kcalPerUnit == null) unknown = true;
      else kcal += Math.round(line.kcalPerUnit * line.quantity);
    }
    const planMacros = nutrientsFromMealPrescription(assignment);
    const ratio = planMacros.kcal > 0 && !unknown ? kcal / planMacros.kcal : 0;
    return {
      kcal,
      unknown,
      protein: ratio > 0 ? Math.round(planMacros.protein * ratio) : 0,
      carbs: ratio > 0 ? Math.round(planMacros.carbs * ratio) : 0,
      fat: ratio > 0 ? Math.round(planMacros.fat * ratio) : 0,
    };
  }, [assignment, logLines]);

  async function addFood(item: TraineeFoodSearchItem) {
    const presets = await loadServingPresetsForFood(api, item);
    const preset = presets[0];
    const qty = preset?.quantity ?? 1;
    const servingId = preset?.servingId ?? item.defaultServingId ?? undefined;
    const kcalEach = itemKcal(item);
    const line: LogLine = {
      key: `food-${item.id}-${Date.now()}`,
      name: cleanFoodLabel(item.name),
      quantity: qty,
      kcalPerUnit: kcalEach,
      unitLabel: unitFromLabel(preset?.label),
      subtitle: "just added",
      item: {
        foodId: item.id,
        servingId,
        quantity: qty,
      },
    };
    setLogLines((prev) => [line, ...prev]);
  }

  function adjustLine(key: string, delta: number) {
    setLogLines((prev) =>
      prev
        .map((line) =>
          line.key === key
            ? { ...line, quantity: Math.max(0, line.quantity + delta) }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  function removeLine(key: string) {
    setLogLines((prev) => prev.filter((line) => line.key !== key));
  }

  async function saveLog() {
    if (logLines.length === 0) {
      setError("Add at least one food.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await deviateMealAssignment(
        sync,
        assignment,
        {
          deviationKind: "logged_foods",
          notes: null,
          photoIntent: null,
          items: logLines.map((line) => ({
            ...line.item,
            quantity: line.quantity,
          })),
        },
        undefined,
        relationshipId,
      );
      invalidateRelationshipDayData(relationshipId);
      onSaved();
    } catch (err) {
      setError(
        err instanceof MealSyncError
          ? err.message
          : err instanceof ApiClientError
            ? err.message
            : "Could not save meal.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen chrome="app" showHeader={false} title="">
      <View style={styles.topnav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.back}
        >
          <ChevronLeft size={24} color={colors.indigo} strokeWidth={2} />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
        <View style={styles.topTitle}>
          <Text style={styles.topTitleMain}>
            {assignment.mealName} · {weekday}
          </Text>
          {planKcal > 0 ? (
            <Text style={styles.topTitleSub}>plan {formatKcal(planKcal)}</Text>
          ) : null}
        </View>
        <View style={styles.topRight} />
      </View>

      {error ? <ErrorBanner message={error} /> : null}

      <View style={styles.srch}>
        <Search size={19} color={colors.midGrey} strokeWidth={1.75} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search foods"
          placeholderTextColor={colors.midGrey}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.srchInput}
        />
        {query.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => setQuery("")}
            style={styles.srchClear}
          >
            <X size={13} color={colors.white} strokeWidth={2.6} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {showPlanBrowse ? (
          <>
            <Text style={styles.sml}>From your plan · frequent</Text>
            <View style={styles.card}>
              {planBrowse.map((row, index) => {
                const kcalEach =
                  row.kcalPreview != null && row.quantity > 0
                    ? Math.round(row.kcalPreview / row.quantity)
                    : null;
                return (
                  <View key={`plan-browse-${index}`} style={styles.lrow}>
                    <View style={styles.lrowText}>
                      <Text style={styles.foodName} numberOfLines={1}>
                        {cleanFoodLabel(row.label)}
                      </Text>
                      <Text style={styles.foodMeta}>
                        {row.displayLabel.split("·").pop()?.trim() ?? "from your plan"}
                        {kcalEach != null ? ` · ${kcalEach} kcal` : ""}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}
        <Text style={styles.sml}>Results</Text>
        <View style={styles.card}>
          {loading ? (
            <ActivityIndicator style={styles.loader} color={colors.indigo} />
          ) : null}
          {results.map((item) => {
            const kcal = itemKcal(item);
            return (
              <View key={item.id} style={styles.lrow}>
                <View style={styles.lrowText}>
                  <Text style={styles.foodName} numberOfLines={1}>
                    {cleanFoodLabel(item.name)}
                    <Text style={styles.srcTag}>FitBud</Text>
                  </Text>
                  <Text style={styles.foodMeta}>
                    1 piece · {kcal != null ? `${kcal} kcal` : "kcal —"}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${item.name}`}
                  onPress={() => void addFood(item)}
                  style={styles.addBtn}
                >
                  <Plus size={22} color={colors.indigo} strokeWidth={1.75} />
                </Pressable>
              </View>
            );
          })}
          {!loading && query.trim().length >= 2 && results.length === 0 ? (
            <Text style={styles.empty}>No matches. Try another spelling.</Text>
          ) : null}
        </View>

        <Text style={styles.hint}>
          Tap a food to pick katori, piece, cup or grams. Can&apos;t find it? Add
          it as your own food.
        </Text>

        <Text style={styles.smlLog}>In this log · {logLines.length}</Text>
        <View style={styles.card}>
          {logLines.map((line) => {
            const lineKcal =
              line.kcalPerUnit != null
                ? Math.round(line.kcalPerUnit * line.quantity)
                : null;
            return (
              <View key={line.key} style={styles.lrow}>
                <View style={styles.lrowText}>
                  <Text style={styles.foodName} numberOfLines={1}>
                    {line.name}
                  </Text>
                  <Text style={styles.foodMeta}>
                    {formatNumber(line.quantity)} ·{" "}
                    {lineKcal != null ? `${lineKcal} kcal` : "kcal —"} ·{" "}
                    {line.subtitle}
                  </Text>
                </View>
                <View style={styles.stp}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Decrease ${line.name}`}
                    onPress={() => adjustLine(line.key, -1)}
                    style={styles.stpBtn}
                  >
                    <Minus size={18} color={colors.indigo} strokeWidth={2.2} />
                  </Pressable>
                  <Text style={styles.stpVal} numberOfLines={1}>
                    {formatNumber(line.quantity)}{" "}
                    <Text style={styles.stpUnit}>{line.unitLabel}</Text>
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Increase ${line.name}`}
                    onPress={() => adjustLine(line.key, 1)}
                    style={styles.stpBtn}
                  >
                    <Plus size={18} color={colors.indigo} strokeWidth={2.2} />
                  </Pressable>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${line.name}`}
                  onPress={() => removeLine(line.key)}
                  style={styles.rmBtn}
                >
                  <X size={18} color={colors.midGrey} strokeWidth={2.4} />
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.abar}>
        <View style={styles.abarTotals}>
          <Text style={styles.abarKcal}>
            {totals.unknown ? "≥ " : ""}
            {totals.kcal} kcal
          </Text>
          <Text style={styles.abarMacros}>
            P {totals.protein} · C {totals.carbs} · F {totals.fat} g
            {planKcal > 0 ? ` · plan ${formatKcal(planKcal)}` : ""}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save"
          disabled={saving}
          onPress={() => void saveLog()}
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        >
          {saving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.saveBtnLabel}>Save</Text>
          )}
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topnav: {
    alignItems: "center",
    flexDirection: "row",
    height: 48,
    marginBottom: spacing.sm,
  },
  back: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 44,
    minWidth: 44,
    paddingLeft: 2,
  },
  backLabel: {
    color: colors.indigo,
    fontSize: 16,
    fontWeight: "600",
  },
  topTitle: {
    alignItems: "center",
    flex: 1,
  },
  topTitleMain: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  topTitleSub: {
    color: colors.midGrey,
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
    textAlign: "center",
  },
  topRight: {
    width: 44,
  },
  srch: {
    alignItems: "center",
    backgroundColor: "#ECEAF4",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    height: 44,
    marginBottom: spacing.md,
    paddingHorizontal: 12,
  },
  srchInput: {
    color: colors.nearBlack,
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    minHeight: 44,
    paddingVertical: 0,
  },
  srchClear: {
    alignItems: "center",
    backgroundColor: "#B9BCC6",
    borderRadius: 10,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  sml: {
    color: colors.midGrey,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  smlLog: {
    color: colors.midGrey,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 18,
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  lrow: {
    alignItems: "center",
    borderTopColor: "#E7E9F2",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  lrowText: {
    flex: 1,
    minWidth: 0,
  },
  foodName: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
  srcTag: {
    backgroundColor: colors.paleLavender,
    borderRadius: 6,
    color: colors.indigo,
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 8,
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  foodMeta: {
    color: colors.midGrey,
    fontSize: 14,
    marginTop: 2,
  },
  addBtn: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  hint: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  stp: {
    alignItems: "center",
    backgroundColor: "#F4F3F8",
    borderColor: "#E7E9F2",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    flexShrink: 0,
    maxWidth: 128,
  },
  stpBtn: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 36,
  },
  stpVal: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "700",
    maxWidth: 64,
    minWidth: 48,
    textAlign: "center",
  },
  stpUnit: {
    color: colors.midGrey,
    fontSize: 12,
    fontWeight: "500",
  },
  rmBtn: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  loader: {
    margin: spacing.md,
  },
  empty: {
    color: colors.midGrey,
    fontSize: 14,
    padding: spacing.md,
  },
  abar: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderTopColor: "#E7E9F2",
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: "row",
    gap: 12,
    left: 0,
    paddingBottom: 34,
    paddingHorizontal: 16,
    paddingTop: 12,
    position: "absolute",
    right: 0,
  },
  abarTotals: {
    flex: 1,
  },
  abarKcal: {
    color: colors.deepNavy,
    fontSize: 18,
    fontWeight: "700",
  },
  abarMacros: {
    color: colors.midGrey,
    fontSize: 13,
    marginTop: 2,
  },
  saveBtn: {
    alignItems: "center",
    backgroundColor: colors.indigo,
    borderRadius: 16,
    height: 56,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnLabel: {
    color: colors.white,
    fontSize: 17,
    fontWeight: "700",
  },
});
