import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { ChevronLeft, Minus, Plus } from "lucide-react-native";
import type { FitBudApiClient } from "@fitbud/api-client";
import type { TraineeFoodDetail } from "@fitbud/contracts";
import { formatNumber } from "@fitbud/core";
import { Text } from "../../components/Text";
import { reportError } from "../../lib/reportError";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import { cleanFoodLabel } from "../mealHelpers";
import { FoodServingChips } from "./FoodServingChips";
import { fetchTraineeFoodDetail } from "./foodServingsApi";
import {
  formatAmount,
  lineFromSearchItem,
  perServingFromDetail,
  searchItemServing,
  type FoodSearchItem,
  type LogLine,
  type Macros,
} from "./logLines";

type Unit = {
  id: string;
  label: string;
  servingId?: string;
  kcal: number | null;
  macros: Macros | null;
  /** Gram unit: amounts are grams, kcal and macros are per gram. */
  gramsPerServing?: number;
};

const SERVING_AMOUNTS = [0.5, 1, 1.5, 2];
const GRAM_AMOUNTS = [50, 100, 150, 200];

/** Units from the food's servings: each named serving, then Grams (TR-26c). */
export function unitsFromDetail(detail: TraineeFoodDetail): Unit[] {
  const ordered = [
    ...detail.servings.filter((s) => s.id === detail.defaultServingId),
    ...detail.servings.filter((s) => s.id !== detail.defaultServingId),
  ];
  const units: Unit[] = [];
  let gramUnit: Unit | null = null;
  for (const serving of ordered) {
    const per = perServingFromDetail(detail, serving.conversionScaled);
    const isWeight = serving.unit === "g" || serving.unit === "ml";
    if (isWeight) {
      if (gramUnit || serving.conversionScaled == null) continue;
      const grams = serving.conversionScaled / 1_000_000;
      if (grams <= 0) continue;
      gramUnit = {
        id: serving.id,
        label: serving.unit === "ml" ? "ml" : "Grams",
        servingId: serving.id,
        kcal: per.kcal == null ? null : per.kcal / grams,
        macros: per.macros
          ? {
              protein: per.macros.protein / grams,
              carbs: per.macros.carbs / grams,
              fat: per.macros.fat / grams,
            }
          : null,
        gramsPerServing: grams,
      };
      continue;
    }
    units.push({
      id: serving.id,
      label: cleanFoodLabel(serving.label),
      servingId: serving.id,
      kcal: per.kcal,
      macros: per.macros,
    });
  }
  return gramUnit ? [...units, gramUnit] : units;
}

function unitFromSearch(item: FoodSearchItem): Unit {
  const serving = searchItemServing(item);
  return {
    id: item.defaultServingId ?? `own:${item.id}`,
    label: serving.label,
    servingId: item.defaultServingId ?? undefined,
    kcal: serving.kcal,
    macros: serving.macros,
  };
}

type Props = {
  api: FitBudApiClient;
  item: FoodSearchItem;
  mealName: string;
  /** The food's line already in the log, when there is one: the picker edits it. */
  existing?: LogLine;
  onBack: () => void;
  onAdd: (line: LogLine) => void;
};

/**
 * TR-26c: pick how much of a food, in katori, piece, cup or grams. The food's
 * own servings come from `GET /me/foods/:id`; until they arrive the search
 * hit's default serving is the one unit, so the screen is usable at once.
 */
export function FoodAmountPicker({ api, item, mealName, existing, onBack, onAdd }: Props) {
  const styles = useStyles();
  const theme = useTheme();
  const own = item.source === "custom";
  const fallback = useMemo(() => [unitFromSearch(item)], [item]);
  const [units, setUnits] = useState<Unit[]>(fallback);
  const [unitId, setUnitId] = useState<string>(
    existing?.source.kind === "library" && existing.source.servingId
      ? existing.source.servingId
      : fallback[0]!.id,
  );
  const [amount, setAmount] = useState<number>(existing?.quantity ?? 1);

  useEffect(() => {
    if (own) return undefined;
    let active = true;
    fetchTraineeFoodDetail(api, item.id)
      .then((detail) => {
        if (!active) return;
        const fromDetail = unitsFromDetail(detail);
        if (fromDetail.length === 0) return;
        setUnits(fromDetail);
        setUnitId((current) =>
          fromDetail.some((u) => u.id === current) ? current : fromDetail[0]!.id,
        );
      })
      .catch((err: unknown) => {
        // The search hit's serving stays the one unit; nothing else to show.
        reportError("FoodAmountPicker.detail", err);
      });
    return () => {
      active = false;
    };
  }, [api, item.id, own]);

  const unit = units.find((u) => u.id === unitId) ?? units[0]!;
  const grams = unit.gramsPerServing != null;
  const step = grams ? 10 : 0.5;
  const presets = grams ? GRAM_AMOUNTS : SERVING_AMOUNTS;
  const kcal = unit.kcal == null ? null : Math.round(unit.kcal * amount);
  const macro = (key: keyof Macros) =>
    unit.macros ? Math.round(unit.macros[key] * amount) : null;
  const mealLower = mealName.toLowerCase();

  function selectUnit(id: string) {
    const next = units.find((u) => u.id === id);
    if (!next) return;
    const nextGrams = next.gramsPerServing != null;
    if (nextGrams !== grams) setAmount(nextGrams ? 100 : 1);
    setUnitId(id);
  }

  function add() {
    if (amount <= 0) return;
    const base = existing ?? lineFromSearchItem(item);
    onAdd({
      ...base,
      quantity: amount,
      unitLabel: grams ? "g" : unit.label,
      grams: grams ? { perServing: unit.gramsPerServing! } : undefined,
      kcalPerUnit: unit.kcal,
      macrosPerUnit: unit.macros,
      source:
        base.source.kind === "library"
          ? { ...base.source, servingId: unit.servingId }
          : base.source,
      servingKnown: true,
      touched: true,
    });
  }

  const addLabel = `Add to ${mealLower}${kcal != null ? ` · ${formatNumber(kcal)} kcal` : ""}`;
  const size = 104;
  const stroke = 10;
  const r = (size - stroke) / 2;

  return (
    <View style={styles.root} testID="food-amount-picker">
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Results"
          onPress={onBack}
          style={styles.navBack}
        >
          <ChevronLeft size={24} color={theme.colors.ink} strokeWidth={2} />
          <Text variant="body">Results</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add"
          disabled={amount <= 0}
          onPress={add}
          style={styles.navBtn}
        >
          <Text variant="bodyStrong">Add</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text variant="largeTitle" accessibilityRole="header">
          {cleanFoodLabel(item.name)}
        </Text>

        <Text variant="label" style={styles.section}>
          Unit
        </Text>
        <FoodServingChips
          groupLabel="Unit"
          options={units.map((u) => ({ id: u.id, label: u.label }))}
          selectedId={unit.id}
          onSelect={selectUnit}
          testIDPrefix="unit-chip"
        />

        <View style={styles.amountRow}>
          <Text variant="headline">Amount</Text>
          <View style={styles.stepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Less"
              disabled={amount - step <= 0}
              onPress={() => setAmount((a) => Math.max(step, a - step))}
              style={styles.stepBtn}
            >
              <Minus size={20} color={theme.colors.ink} strokeWidth={2.2} />
            </Pressable>
            <Text variant="numberMd" style={styles.stepValue} testID="amount-value">
              {grams ? `${formatAmount(amount)} g` : formatAmount(amount)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More"
              onPress={() => setAmount((a) => a + step)}
              style={styles.stepBtn}
            >
              <Plus size={20} color={theme.colors.ink} strokeWidth={2.2} />
            </Pressable>
          </View>
        </View>
        <FoodServingChips
          groupLabel="Amount"
          options={presets.map((p) => ({
            id: String(p),
            label: grams ? `${p} g` : formatAmount(p),
          }))}
          selectedId={presets.includes(amount) ? String(amount) : null}
          onSelect={(id) => setAmount(Number(id))}
          testIDPrefix="amount-chip"
        />

        <View style={styles.card}>
          <View style={{ width: size, height: size }}>
            <Svg width={size} height={size}>
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={theme.colors.brand}
                strokeWidth={stroke}
                fill="none"
              />
            </Svg>
            <View style={styles.ringCenter} pointerEvents="none">
              <Text variant="numberLg" testID="picker-kcal">
                {kcal != null ? formatNumber(kcal) : "—"}
              </Text>
              <Text variant="caption">kcal</Text>
            </View>
          </View>
          <View style={styles.macros}>
            {(
              [
                ["Protein", "protein", theme.colors.protein],
                ["Carbs", "carbs", theme.colors.carbs],
                ["Fat", "fat", theme.colors.fat],
              ] as const
            ).map(([label, key, color]) => {
              const value = macro(key);
              return (
                <View key={key} style={styles.macroRow}>
                  <View style={[styles.macroDot, { backgroundColor: color }]} />
                  <Text variant="body" style={styles.macroLabel}>
                    {label}
                  </Text>
                  <Text variant="bodyStrong">{value != null ? `${value} g` : "—"}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.mealRow}>
          <Text variant="body">Meal</Text>
          <Text variant="body" tone="ink3">
            {mealName}
          </Text>
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={addLabel}
          disabled={amount <= 0}
          onPress={add}
          style={styles.primary}
        >
          <Text variant="bodyStrong" tone="onBrand">
            {addLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  root: { backgroundColor: t.colors.bgPlain, flex: 1 },
  nav: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  navBack: { alignItems: "center", flexDirection: "row", minHeight: t.touchTarget },
  navBtn: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: t.touchTarget,
    minWidth: t.touchTarget,
  },
  body: { gap: 12, paddingBottom: 24, paddingHorizontal: 20 },
  section: { marginTop: 12 },
  amountRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  stepper: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: t.radii.button,
    flexDirection: "row",
  },
  stepBtn: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    width: 52,
  },
  stepValue: { minWidth: 64, textAlign: "center" },
  card: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: t.radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 20,
    marginTop: 12,
    padding: 18,
  },
  ringCenter: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  macros: { flex: 1, gap: 10 },
  macroRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  macroDot: { borderRadius: 2, height: 10, width: 10 },
  macroLabel: { flex: 1 },
  mealRow: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: t.radii.group,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 56,
    paddingHorizontal: 16,
  },
  footer: {
    backgroundColor: t.colors.bgPlain,
    borderTopColor: t.colors.line,
    borderTopWidth: 1,
    paddingBottom: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  primary: {
    alignItems: "center",
    backgroundColor: t.colors.brand,
    borderRadius: t.radii.button,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 16,
  },
}));
