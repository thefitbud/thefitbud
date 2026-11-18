import { useState } from "react";
import { Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { formatNumber } from "@fitbud/core";
import { Text } from "../components/Text";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";
import { FoodNavHeader } from "./food/FoodNavHeader";
import { lineFromCustomFood, type LogLine } from "./food/logLines";

/** The unit a created food is counted in (TR-26e shows "1 piece"). */
const CUSTOM_UNIT = "piece";

export type CustomFoodErrors = Partial<Record<"name" | "amount" | "kcal" | "macros", string>>;

export type CustomFoodDraft = {
  name: string;
  amount: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
};

function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : Number.NaN;
}

/**
 * TR-26e rules (D-W12-11): name, amount and kcal are required; protein, carbs
 * and fat are optional. Limits follow the log contract (kcal 0–20,000 whole,
 * macros 0–2,000 g). Returns the errors to show, empty when the food is valid.
 */
export function validateCustomFood(draft: CustomFoodDraft): CustomFoodErrors {
  const errors: CustomFoodErrors = {};
  if (!draft.name.trim()) errors.name = "Enter the food’s name.";
  const amount = parseNumber(draft.amount);
  if (amount == null || Number.isNaN(amount) || amount <= 0 || amount > 100) {
    errors.amount = "Enter how much you had.";
  }
  const kcal = parseNumber(draft.kcal);
  if (kcal == null || Number.isNaN(kcal) || kcal < 0 || kcal > 20000) {
    errors.kcal = "Enter the kcal.";
  }
  for (const value of [draft.protein, draft.carbs, draft.fat]) {
    const n = parseNumber(value);
    if (n != null && (Number.isNaN(n) || n < 0 || n > 2000)) {
      errors.macros = "Macros are grams, from 0 to 2,000.";
    }
  }
  return errors;
}

type Props = {
  mealName: string;
  coachName: string;
  /** What the trainee searched for, as the name to start from ("Ragi dosa"). */
  initialName: string;
  saving: boolean;
  onCancel: () => void;
  /** The created food as a log line; the caller logs it with the meal. */
  onAdd: (line: LogLine) => void;
};

/**
 * TR-26e: create a food that is not in the list. Shown in place of the food
 * search (same overlay), so Cancel returns to the search with the log intact.
 */
export function CustomFoodScreen({
  mealName,
  coachName,
  initialName,
  saving,
  onCancel,
  onAdd,
}: Props) {
  const styles = useStyles();
  const theme = useTheme();
  const [draft, setDraft] = useState<CustomFoodDraft>({
    name: initialName,
    amount: "1",
    kcal: "",
    protein: "",
    carbs: "",
    fat: "",
  });
  const [saveToMyFoods, setSaveToMyFoods] = useState(true);
  const [errors, setErrors] = useState<CustomFoodErrors>({});
  const [focused, setFocused] = useState<keyof CustomFoodDraft | null>(null);

  const kcalNumber = parseNumber(draft.kcal);
  const kcalShown =
    kcalNumber != null && !Number.isNaN(kcalNumber) ? Math.round(kcalNumber) : null;
  const addLabel = `Add to ${mealName.toLowerCase()}${
    kcalShown != null ? ` · ${formatNumber(kcalShown)} kcal` : ""
  }`;

  function set(field: keyof CustomFoodDraft, value: string) {
    setDraft((d) => ({ ...d, [field]: value }));
    if (Object.keys(errors).length > 0) setErrors({});
  }

  function add() {
    const found = validateCustomFood(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const macro = (text: string) => {
      const n = parseNumber(text);
      return n == null || Number.isNaN(n) ? undefined : n;
    };
    onAdd(
      lineFromCustomFood({
        key: `new:${Date.now()}`,
        name: draft.name,
        amount: parseNumber(draft.amount)!,
        unit: CUSTOM_UNIT,
        kcal: Math.round(parseNumber(draft.kcal)!),
        macros: {
          protein: macro(draft.protein),
          carbs: macro(draft.carbs),
          fat: macro(draft.fat),
        },
        saveToMyFoods,
      }),
    );
  }

  function field(
    key: keyof CustomFoodDraft,
    opts: { label: string; suffix?: string; numeric?: boolean; placeholder?: string },
  ) {
    const invalid =
      (key === "name" && errors.name) ||
      (key === "amount" && errors.amount) ||
      (key === "kcal" && errors.kcal);
    return (
      <View style={styles.fieldWrap}>
        <Text variant="label" style={styles.fieldLabel} nativeID={`custom-${key}-label`}>
          {opts.label}
        </Text>
        <View
          style={[
            styles.input,
            focused === key ? styles.inputFocus : null,
            invalid ? styles.inputInvalid : null,
          ]}
        >
          <TextInput
            value={draft[key]}
            onChangeText={(value) => set(key, value)}
            onFocus={() => setFocused(key)}
            onBlur={() => setFocused(null)}
            keyboardType={opts.numeric ? "decimal-pad" : "default"}
            placeholder={opts.placeholder}
            placeholderTextColor={theme.colors.ink4}
            accessibilityLabel={opts.label}
            style={styles.inputText}
            testID={`custom-${key}`}
          />
          {opts.suffix ? (
            <Text variant="body" tone="ink3">
              {opts.suffix}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  const errorList = [errors.name, errors.amount, errors.kcal, errors.macros].filter(Boolean);

  return (
    <View style={styles.root} testID="custom-food-screen">
      <FoodNavHeader
        title="Create a food"
        subtitle={mealName}
        onLeft={onCancel}
        rightLabel="Add"
        onRight={add}
        busy={saving}
      />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {field("name", { label: "Food name", placeholder: "Ragi dosa" })}
        <View style={styles.pair}>
          <View style={styles.flex}>
            {field("amount", { label: "Amount", suffix: CUSTOM_UNIT, numeric: true })}
          </View>
          <View style={styles.flex}>
            {field("kcal", { label: "Calories", suffix: "kcal", numeric: true })}
          </View>
        </View>
        <Text variant="label" style={styles.section}>
          Macros · optional
        </Text>
        <View style={styles.pair}>
          {(
            [
              ["protein", "Protein"],
              ["carbs", "Carbs"],
              ["fat", "Fat"],
            ] as const
          ).map(([key, label]) => (
            <View key={key} style={styles.flex}>
              {field(key, { label, suffix: "g", numeric: true, placeholder: "0" })}
            </View>
          ))}
        </View>
        <View style={styles.toggleRow}>
          <View style={styles.flex}>
            <Text variant="body">Save to my foods</Text>
            <Text variant="subhead">Find it in search next time</Text>
          </View>
          <Switch
            value={saveToMyFoods}
            onValueChange={setSaveToMyFoods}
            accessibilityLabel="Save to my foods"
            accessibilityRole="switch"
            trackColor={{ false: theme.colors.fill2, true: theme.colors.done }}
            thumbColor={theme.colors.white}
            testID="custom-save-to-my-foods"
          />
        </View>
        <Text variant="caption" style={styles.coachNote}>
          {coachName.split(/\s+/)[0] ?? coachName} sees this as a food you added.
        </Text>
        {errorList.length > 0 ? (
          <View accessibilityRole="alert" style={styles.errors}>
            {errorList.map((message) => (
              <Text key={message} variant="subhead" tone="crit">
                {message}
              </Text>
            ))}
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={addLabel}
          disabled={saving}
          onPress={add}
          style={[styles.primary, saving ? styles.primaryBusy : null]}
        >
          <Text variant="bodyStrong" tone="onBrand">
            {addLabel}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  root: { backgroundColor: t.colors.bgPlain, flex: 1 },
  body: { gap: 12, paddingBottom: 32, paddingHorizontal: 20, paddingTop: 4 },
  fieldWrap: { gap: 6 },
  fieldLabel: { textTransform: "none" },
  section: { marginTop: 4 },
  pair: { flexDirection: "row", gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  input: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line2,
    borderRadius: t.radii.input + 2,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 56,
    paddingHorizontal: 16,
  },
  inputFocus: { borderColor: t.colors.ink, borderWidth: 2 },
  inputInvalid: { borderColor: t.colors.crit, borderWidth: 2 },
  inputText: {
    color: t.colors.ink,
    flex: 1,
    fontSize: 17,
    minHeight: t.touchTarget,
    minWidth: 0,
    paddingVertical: 0,
  },
  toggleRow: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: t.radii.group,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  coachNote: { marginHorizontal: 2 },
  errors: { gap: 4 },
  primary: {
    alignItems: "center",
    backgroundColor: t.colors.brand,
    borderRadius: t.radii.button,
    justifyContent: "center",
    marginTop: 4,
    minHeight: 56,
    paddingHorizontal: 16,
  },
  primaryBusy: { opacity: 0.6 },
}));
