import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Pencil,
  Plus,
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

  const planMacros = useMemo(
    () => nutrientsFromMealPrescription(assignment),
    [assignment],
  );
  const planKcal = planMacros.kcal;
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
    const ratio =
      planMacros.kcal > 0 && !hasUnknown ? kcal / planMacros.kcal : 0;
    return {
      kcal,
      hasUnknown,
      protein: ratio > 0 ? Math.round(planMacros.protein * ratio) : 0,
      carbs: ratio > 0 ? Math.round(planMacros.carbs * ratio) : 0,
      fat: ratio > 0 ? Math.round(planMacros.fat * ratio) : 0,
    };
  }, [portionRows, planMacros]);

  function syncErrorMessage(err: unknown): string {
    if (err instanceof MealSyncError) return err.message;
    if (err instanceof ApiClientError) return err.message;
    return "Could not save meal.";
  }

  function openFoodSearch() {
    onOpenFoodSearch?.();
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

  function sheetNav(showBack = false) {
    return (
      <View style={styles.sheetNav}>
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
            <ChevronLeft size={24} color={colors.indigo} strokeWidth={2} />
            <Text style={styles.backLabel}>Back</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onCancel}
          style={styles.xbtn}
        >
          <X size={17} color={colors.midGrey} strokeWidth={2.4} />
        </Pressable>
      </View>
    );
  }

  function sheetHeader(title: string, subtitle?: string, showBack = false) {
    return (
      <>
        {sheetNav(showBack)}
        <View style={styles.titleBlock}>
          <Text style={styles.sheetTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sheetSubtitle}>{subtitle}</Text> : null}
        </View>
      </>
    );
  }

  function saveButton(label: string, onPress: () => void) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={saving}
        onPress={onPress}
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
      >
        {saving ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.saveBtnLabel}>{label}</Text>
        )}
      </Pressable>
    );
  }

  function WhatsAppGlyph() {
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Path
          fill="#25D366"
          d="M12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.9 0-3.18-1.24-6.16-3.48-8.41A11.82 11.82 0 0 0 12.05 0Z"
        />
        <Path
          fill="#fff"
          d="M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88Z"
        />
        <Path
          fill="#25D366"
          d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.47-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35Z"
        />
      </Svg>
    );
  }

  const menuBody = (
    <>
      {variant === "sheet"
        ? sheetHeader("What did you have instead?", mealSubtitle)
        : null}
      <View style={styles.opt3}>
        <Pressable
          accessibilityRole="button"
          style={styles.opt}
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
          style={styles.opt}
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
          style={styles.opt}
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
          <WhatsAppGlyph />
          <Text style={styles.askCoachText}>
            Ask {coachShort} about this meal
          </Text>
        </Pressable>
      ) : null}
    </>
  );

  const ateOutBody = (
    <View style={styles.subScreen}>
      <ScrollView
        style={styles.subScroll}
        contentContainerStyle={styles.subScrollContent}
        keyboardShouldPersistTaps="handled"
      >
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
              style={styles.placeChipOutline}
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
              <Text style={styles.placeChipOutlineText}>{chip}</Text>
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
      </ScrollView>
      <View style={styles.stickySave}>{saveButton("Save", () => void saveAteOut())}</View>
    </View>
  );

  const portionBody = (
    <View style={styles.subScreen}>
      <ScrollView
        style={styles.subScroll}
        contentContainerStyle={styles.subScrollContent}
        keyboardShouldPersistTaps="handled"
      >
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
              <View key={`${row.label}-${index}`} style={styles.prow}>
                <View style={styles.prowText}>
                  <Text style={styles.prowName} numberOfLines={1}>
                    {row.label}
                  </Text>
                  <Text style={styles.prowMeta}>
                    {kcal != null ? `${kcal} kcal` : "kcal unknown"}
                    {asPlanned
                      ? " · as planned"
                      : ` · plan ${row.plannedQuantity} ${row.unitLabel}`}
                  </Text>
                </View>
                <View style={styles.stp}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Decrease ${row.label}`}
                    onPress={() => adjustPortion(index, -PORTION_STEP)}
                    style={styles.stpBtn}
                  >
                    <Minus size={18} color={colors.indigo} strokeWidth={2.2} />
                  </Pressable>
                  <Text style={styles.stpValue} numberOfLines={1}>
                    {formatQuantityDisplay(row.quantity)}{" "}
                    <Text style={styles.stpUnit}>{row.unitLabel}</Text>
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Increase ${row.label}`}
                    onPress={() => adjustPortion(index, PORTION_STEP)}
                    style={styles.stpBtn}
                  >
                    <Plus size={18} color={colors.indigo} strokeWidth={2.2} />
                  </Pressable>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${row.label}`}
                  onPress={() => removePortionRow(index)}
                  style={styles.removeBtn}
                >
                  <X size={18} color={colors.midGrey} strokeWidth={2.4} />
                </Pressable>
              </View>
            );
          })}
        </View>
        <Text style={styles.noteLabel}>
          Note for {coachShort}{" "}
          <Text style={styles.noteOptional}>· optional</Text>
        </Text>
        <View style={styles.noteFieldWrap}>
          <Pencil size={18} color={colors.indigo} style={styles.noteIcon} />
          <TextInput
            value={portionNote}
            onChangeText={setPortionNote}
            placeholder="Anything your coach should know?"
            placeholderTextColor={colors.midGrey}
            style={styles.noteField}
          />
        </View>
        {error ? <ErrorBanner message={error} /> : null}
      </ScrollView>
      <View style={styles.stickyFooter}>
        <View style={styles.totbar}>
          <Text style={styles.totbarMain}>
            <Text style={styles.totbarKcal}>
              {portionTotals.hasUnknown ? "≥ " : ""}
              {portionTotals.kcal} kcal
            </Text>
            <Text style={styles.totbarMacros}>
              {" "}
              · P {portionTotals.protein} · C {portionTotals.carbs} · F{" "}
              {portionTotals.fat} g
            </Text>
          </Text>
          {planKcal > 0 ? (
            <Text style={styles.totbarPlan}>plan {formatKcal(planKcal)}</Text>
          ) : null}
        </View>
        {saveButton("Save", () => void savePortion())}
      </View>
    </View>
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
    maxHeight: 560,
  },
  sheetNav: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  backBtn: {
    alignItems: "center",
    flexDirection: "row",
    gap: 0,
    minHeight: 44,
  },
  backLabel: {
    color: colors.indigo,
    fontSize: 16,
    fontWeight: "600",
  },
  xbtn: {
    alignItems: "center",
    backgroundColor: "#EFEEF5",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  titleBlock: {
    marginBottom: spacing.xs,
  },
  sheetTitle: {
    color: colors.deepNavy,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  sheetSubtitle: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },
  opt3: {
    gap: 10,
    marginTop: spacing.md,
  },
  opt: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: "#D5D6DE",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionIcon: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderRadius: 15,
    height: 48,
    justifyContent: "center",
    width: 48,
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
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: 10,
    minHeight: 44,
  },
  askCoachText: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "500",
  },
  subScreen: {
    flex: 1,
    maxHeight: 520,
  },
  subScroll: {
    flex: 1,
  },
  subScrollContent: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  stickySave: {
    borderTopColor: "#E7E9F2",
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
  stickyFooter: {
    borderTopColor: "#E7E9F2",
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  saveBtn: {
    alignItems: "center",
    backgroundColor: colors.indigo,
    borderRadius: 16,
    height: PRIMARY_BTN_HEIGHT,
    justifyContent: "center",
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnLabel: {
    color: colors.white,
    fontSize: 17,
    fontWeight: "700",
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
  placeChipOutline: {
    backgroundColor: colors.white,
    borderColor: "#D5D6DE",
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  placeChipOutlineText: {
    color: colors.darkGrey,
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
    marginTop: 14,
  },
  prow: {
    alignItems: "center",
    borderTopColor: "#E7E9F2",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 72,
    paddingVertical: 10,
  },
  prowText: {
    flex: 1,
    minWidth: 0,
  },
  prowName: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
  prowMeta: {
    color: colors.midGrey,
    fontSize: 13,
    marginTop: 1,
  },
  stp: {
    alignItems: "center",
    backgroundColor: "#F4F3F8",
    borderColor: "#E7E9F2",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    flexShrink: 0,
    maxWidth: 132,
  },
  stpBtn: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 36,
  },
  stpValue: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "700",
    flexShrink: 1,
    minWidth: 56,
    maxWidth: 68,
    textAlign: "center",
  },
  stpUnit: {
    color: colors.midGrey,
    fontSize: 12,
    fontWeight: "500",
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
  noteFieldWrap: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: radii.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  noteIcon: {
    marginTop: 2,
  },
  noteField: {
    color: colors.darkGrey,
    flex: 1,
    fontSize: 16,
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
  totbar: {
    alignItems: "baseline",
    backgroundColor: "#F4F3F8",
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  totbarMain: {
    flex: 1,
    flexWrap: "wrap",
  },
  totbarKcal: {
    color: colors.deepNavy,
    fontSize: 18,
    fontWeight: "700",
  },
  totbarMacros: {
    color: colors.midGrey,
    fontSize: 13,
  },
  totbarPlan: {
    color: colors.midGrey,
    fontSize: 13,
  },
});
