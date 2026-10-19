import { useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  Store,
  X,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type { LoggedFoodItem, MealAssignment } from "@fitbud/contracts";
import { formatKcal } from "@fitbud/core";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { useSyncEngine } from "../sync/SyncProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { deviateMealAssignment, MealSyncError } from "./mealActions";
import {
  plannedRowsFromAssignment,
  type PlannedRow,
} from "../lib/plannedMealItems";
import { invalidateRelationshipDayData } from "./dataCache";
import { nutrientsFromMealPrescription } from "./nutrition";

const PLACE_CHIPS = [
  "Office canteen",
  "Restaurant",
  "Street food",
  "At a friend's",
];

const PORTION_STEP = 0.25;
const PRIMARY_BTN_HEIGHT = 56;

type ScreenId = "menu" | "ate_out" | "portion";

type PortionRow = PlannedRow & {
  plannedQuantity: number;
  removed: boolean;
};

type Props = {
  assignment: MealAssignment;
  relationshipId: string;
  variant?: "screen" | "sheet";
  coachName?: string;
  onDone: () => void;
  onCancel: () => void;
  onOpenFoodSearch?: () => void;
  onAskCoach?: () => void;
};

function formatQuantityDisplay(quantity: number): string {
  if (quantity === 0.5) return "½";
  if (quantity === 0.25) return "¼";
  if (quantity === 0.75) return "¾";
  if (Math.abs(quantity - Math.round(quantity)) < 0.001) {
    return String(Math.round(quantity));
  }
  return quantity.toFixed(2).replace(/\.?0+$/, "");
}

function scaledKcal(row: PortionRow): number | null {
  if (row.kcalPreview == null || row.plannedQuantity <= 0) return null;
  return Math.round((row.kcalPreview / row.plannedQuantity) * row.quantity);
}

function portionRowToLoggedItem(row: PortionRow): LoggedFoodItem {
  const kcal = scaledKcal(row);
  if (row.foodId) {
    return {
      foodId: row.foodId,
      servingId: row.servingId,
      quantity: row.quantity,
    };
  }
  return {
    customFood: {
      name: row.label,
      kcal: kcal ?? 0,
    },
  };
}

export function SomethingDifferentSheet({
  assignment,
  relationshipId,
  variant = "screen",
  coachName = "Your coach",
  onDone,
  onCancel,
  onOpenFoodSearch,
  onAskCoach,
}: Props) {
  const sync = useSyncEngine();
  const coachShort = coachName.split(/\s+/)[0] ?? coachName;

  const [screen, setScreen] = useState<ScreenId>("menu");
  const [ateOutNote, setAteOutNote] = useState("");
  const [portionNote, setPortionNote] = useState("");
  const [portionRows, setPortionRows] = useState<PortionRow[]>(() =>
    plannedRowsFromAssignment(assignment).map((row) => ({
      ...row,
      plannedQuantity: row.quantity,
      removed: false,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planKcal = nutrientsFromMealPrescription(assignment).kcal;
  const mealSubtitle = `${assignment.mealName}${
    planKcal > 0 ? ` · plan ${formatKcal(planKcal)}` : ""
  }`;

  const portionTotals = useMemo(() => {
    let kcal = 0;
    let hasUnknown = false;
    for (const row of portionRows) {
      if (row.removed || row.quantity <= 0) continue;
      const rowKcal = scaledKcal(row);
      if (rowKcal == null) hasUnknown = true;
      else kcal += rowKcal;
    }
    return { kcal, hasUnknown };
  }, [portionRows]);

  function syncErrorMessage(err: unknown): string {
    if (err instanceof MealSyncError) return err.message;
    if (err instanceof ApiClientError) return err.message;
    return "Could not save meal.";
  }

  function openFoodSearch() {
    onOpenFoodSearch?.();
    onDone();
  }

  function adjustPortion(index: number, delta: number) {
    setPortionRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const next = Math.max(0, row.quantity + delta);
        return { ...row, quantity: next, removed: next <= 0 };
      }),
    );
  }

  function removePortionRow(index: number) {
    setPortionRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, quantity: 0, removed: true } : row,
      ),
    );
  }

  async function saveAteOut() {
    const notes = ateOutNote.trim();
    if (!notes) {
      setError("Add a short note about what you had.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await deviateMealAssignment(
        sync,
        assignment,
        {
          deviationKind: "restaurant",
          notes,
          photoIntent: null,
          items: [],
        },
        undefined,
        relationshipId,
      );
      invalidateRelationshipDayData(relationshipId);
      onDone();
    } catch (err) {
      setError(syncErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function savePortion() {
    const active = portionRows.filter((row) => !row.removed && row.quantity > 0);
    if (active.length === 0) {
      setError("Keep at least one food, or use another option.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const items = active.map(portionRowToLoggedItem);
      const note = portionNote.trim();
      await deviateMealAssignment(
        sync,
        assignment,
        {
          deviationKind: "portion_adjustment",
          notes: note || null,
          photoIntent: null,
          items,
        },
        undefined,
        relationshipId,
      );
      invalidateRelationshipDayData(relationshipId);
      onDone();
    } catch (err) {
      setError(syncErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function sheetHeader(title: string, subtitle?: string, showBack = false) {
    return (
      <View style={styles.sheetHeader}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => {
              setError(null);
              setScreen("menu");
            }}
            style={styles.backBtn}
          >
            <ChevronLeft size={22} color={colors.indigo} />
            <Text style={styles.backLabel}>Back</Text>
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onCancel}
          style={styles.closeBtn}
        >
          <X size={22} color={colors.darkGrey} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.sheetTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sheetSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
    );
  }

  function saveButton(label: string, onPress: () => void) {
    return (
      <PrimaryButton
        label={label}
        loading={saving}
        onPress={onPress}
        style={styles.saveBtn}
      />
    );
  }

  const menuBody = (
    <>
      {variant === "sheet"
        ? sheetHeader("What did you have instead?", mealSubtitle)
        : null}
      <View style={styles.optionList}>
        <Pressable
          accessibilityRole="button"
          style={styles.optionRow}
          onPress={() => {
            setError(null);
            setScreen("ate_out");
          }}
        >
          <View style={[styles.optionIcon, styles.optionIconAttn]}>
            <Store size={22} color={colors.deepNavy} />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Ate out</Text>
            <Text style={styles.optionSub}>
              Write what you had. {coachShort} sees your note.
            </Text>
          </View>
          <ChevronRight size={20} color={colors.midGrey} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={styles.optionRow}
          onPress={openFoodSearch}
        >
          <View style={styles.optionIcon}>
            <Search size={22} color={colors.deepNavy} />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Log it myself</Text>
            <Text style={styles.optionSub}>
              Search the food library and set amounts
            </Text>
          </View>
          <ChevronRight size={20} color={colors.midGrey} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={styles.optionRow}
          onPress={() => {
            setError(null);
            setScreen("portion");
          }}
        >
          <View style={[styles.optionIcon, styles.optionIconPos]}>
            <SlidersHorizontal size={22} color={colors.deepNavy} />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Changed the portion</Text>
            <Text style={styles.optionSub}>
              Same foods, more or less of each
            </Text>
          </View>
          <ChevronRight size={20} color={colors.midGrey} />
        </Pressable>
      </View>
      {onAskCoach ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAskCoach}
          style={styles.askCoach}
        >
          <Text style={styles.askCoachText}>
            Ask {coachShort} about this meal
          </Text>
        </Pressable>
      ) : null}
    </>
  );

  const ateOutBody = (
    <>
      {sheetHeader(
        "Ate out",
        `${assignment.mealName} · what did you have, and where?`,
        true,
      )}
      <TextInput
        value={ateOutNote}
        onChangeText={setAteOutNote}
        placeholder="What did you eat?"
        placeholderTextColor={colors.midGrey}
        multiline
        style={styles.noteBox}
        textAlignVertical="top"
      />
      <Text style={styles.hint}>
        Nutrition stays unknown, so today&apos;s kcal shows as “at least”.{" "}
        {coachShort} sees your note.
      </Text>
      <View style={styles.chipRow}>
        {PLACE_CHIPS.map((chip) => (
          <Pressable
            key={chip}
            accessibilityRole="button"
            style={styles.placeChip}
            onPress={() => {
              setAteOutNote((prev) => {
                const trimmed = prev.trim();
                if (!trimmed) return `${chip}: `;
                if (trimmed.toLowerCase().startsWith(chip.toLowerCase())) {
                  return prev;
                }
                return `${chip}: ${prev}`;
              });
            }}
          >
            <Text style={styles.placeChipText}>{chip}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={openFoodSearch}
        style={styles.linkRow}
      >
        <Text style={styles.linkText}>Know the foods? Log it myself instead</Text>
      </Pressable>
      {error ? <ErrorBanner message={error} /> : null}
      {saveButton("Save", () => void saveAteOut())}
    </>
  );

  const portionBody = (
    <>
      {sheetHeader(
        "Changed the portion",
        `${assignment.mealName} · set how much you had of each`,
        true,
      )}
      <View style={styles.portionList}>
        {portionRows.map((row, index) => {
          if (row.removed) return null;
          const kcal = scaledKcal(row);
          const asPlanned = row.quantity === row.plannedQuantity;
          return (
            <View key={`${row.label}-${index}`} style={styles.portionRow}>
              <View style={styles.portionMain}>
                <Text style={styles.portionName}>{row.label}</Text>
                <Text style={styles.portionMeta}>
                  {kcal != null ? `${kcal} kcal` : "kcal unknown"}
                  {asPlanned ? " · as planned" : ` · plan ${row.displayLabel}`}
                </Text>
              </View>
              <View style={styles.stepper}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Decrease ${row.label}`}
                  onPress={() => adjustPortion(index, -PORTION_STEP)}
                  style={styles.stepBtn}
                >
                  <Text style={styles.stepGlyph}>−</Text>
                </Pressable>
                <Text style={styles.stepValue}>
                  {formatQuantityDisplay(row.quantity)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Increase ${row.label}`}
                  onPress={() => adjustPortion(index, PORTION_STEP)}
                  style={styles.stepBtn}
                >
                  <Text style={styles.stepGlyph}>+</Text>
                </Pressable>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${row.label}`}
                onPress={() => removePortionRow(index)}
                style={styles.removeBtn}
              >
                <X size={18} color={colors.midGrey} />
              </Pressable>
            </View>
          );
        })}
      </View>
      <Text style={styles.noteLabel}>
        Note for {coachShort} <Text style={styles.noteOptional}>· optional</Text>
      </Text>
      <TextInput
        value={portionNote}
        onChangeText={setPortionNote}
        placeholder="Anything your coach should know?"
        placeholderTextColor={colors.midGrey}
        style={styles.noteField}
      />
      <View style={styles.totalsBar}>
        <Text style={styles.totalsMain}>
          <Text style={styles.totalsKcal}>
            {portionTotals.hasUnknown ? "≥ " : ""}
            {portionTotals.kcal} kcal
          </Text>
        </Text>
        {planKcal > 0 ? (
          <Text style={styles.totalsPlan}>plan {formatKcal(planKcal)}</Text>
        ) : null}
      </View>
      {error ? <ErrorBanner message={error} /> : null}
      {saveButton("Save", () => void savePortion())}
    </>
  );

  const body =
    screen === "ate_out"
      ? ateOutBody
      : screen === "portion"
        ? portionBody
        : menuBody;

  if (variant === "sheet") {
    return <View style={styles.sheetBody}>{body}</View>;
  }

  const screenTitle =
    screen === "ate_out"
      ? "Ate out"
      : screen === "portion"
        ? "Changed the portion"
        : "What did you have instead?";

  return (
    <Screen title={screenTitle} subtitle={mealSubtitle}>
      {body}
      {screen === "menu" ? (
        <PrimaryButton label="Cancel" variant="ghost" onPress={onCancel} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sheetBody: {
    gap: spacing.md,
  },
  sheetHeader: {
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  backSpacer: {
    height: 0,
  },
  backBtn: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    minHeight: 44,
    alignSelf: "flex-start",
  },
  backLabel: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
  closeBtn: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1,
  },
  titleBlock: {
    paddingRight: spacing.xl,
  },
  sheetTitle: {
    color: colors.deepNavy,
    fontSize: 20,
    fontWeight: "700",
  },
  sheetSubtitle: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  optionList: {
    gap: spacing.sm,
  },
  optionRow: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  optionIcon: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  optionIconAttn: {
    backgroundColor: "#FFFBEB",
  },
  optionIconPos: {
    backgroundColor: "#ECFDF5",
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "700",
  },
  optionSub: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  askCoach: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    marginTop: spacing.sm,
  },
  askCoachText: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
  noteBox: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: radii.card,
    borderWidth: 1,
    color: colors.darkGrey,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 120,
    padding: spacing.md,
  },
  hint: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  placeChip: {
    backgroundColor: colors.paleLavender,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  placeChipText: {
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "600",
  },
  linkRow: {
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  linkText: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
  portionList: {
    gap: spacing.sm,
  },
  portionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  portionMain: {
    flex: 1,
    gap: 2,
  },
  portionName: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "700",
  },
  portionMeta: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
  },
  stepper: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderRadius: radii.card,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  stepBtn: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    minWidth: 40,
  },
  stepGlyph: {
    color: colors.deepNavy,
    fontSize: 20,
    fontWeight: "600",
  },
  stepValue: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "700",
    minWidth: 36,
    textAlign: "center",
  },
  removeBtn: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
  },
  noteLabel: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "600",
    marginTop: spacing.sm,
  },
  noteOptional: {
    color: colors.midGrey,
    fontWeight: "500",
  },
  noteField: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: radii.control,
    borderWidth: 1,
    color: colors.darkGrey,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  totalsBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  totalsMain: {
    color: colors.deepNavy,
    fontSize: 15,
  },
  totalsKcal: {
    fontWeight: "700",
  },
  totalsPlan: {
    color: colors.midGrey,
    fontSize: 14,
    fontWeight: "600",
  },
  saveBtn: {
    minHeight: PRIMARY_BTN_HEIGHT,
  },
});
