import { useMemo, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import {
  ChevronRight,
  MessageCircle,
  Minus,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Store,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { userFacingMessage } from "@fitbud/api-client";
import type { LoggedFoodItem, MealAssignment } from "@fitbud/contracts";
import { formatClockTime, formatNumber } from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { Text } from "../components/Text";
import { plannedRowsFromAssignment, type PlannedRow } from "../lib/plannedMealItems";
import { reportError } from "../lib/reportError";
import { ThemeScope, createThemedStyles, useTheme } from "../providers/ThemeProvider";
import { useSyncEngine } from "../sync/SyncProvider";
import { AteOutForm, type CoachDeviateSave } from "./food/AteOutForm";
import { FoodNavHeader } from "./food/FoodNavHeader";
import { amountWithUnit, formatAmount, unitNoun } from "./food/logLines";
import { announceMealSaved } from "./food/mealSavedNotice";
import { deviateMealAssignment } from "./mealActions";
import { cleanFoodLabel } from "./mealHelpers";
import { nutrientsFromMealPrescription } from "./nutrition";

/** TR-08b: "Steps are ½." */
const PORTION_STEP = 0.5;
const PORTION_MAX = 20;

type ScreenId = "menu" | "ate_out" | "portion";

type PortionRow = PlannedRow & { plannedQuantity: number };

type Props = {
  assignment: MealAssignment;
  relationshipId: string;
  variant?: "screen" | "sheet";
  coachName?: string;
  onDone: () => void;
  onCancel: () => void;
  onOpenFoodSearch?: () => void;
  onAskCoach?: () => void;
  /**
   * Z12-52: coach logs in person. Reuses TR-08a–c; saves through onCoachSave
   * (trainer PUT) instead of the trainee sync deviate.
   */
  authorMode?: "trainee" | "coach";
  /** Client display name when authorMode is coach (portion / ate-out copy). */
  clientName?: string;
  onCoachSave?: CoachDeviateSave;
};

function rowKcal(row: PortionRow): number | null {
  if (row.kcalPreview == null || row.plannedQuantity <= 0) return null;
  return Math.round((row.kcalPreview / row.plannedQuantity) * row.quantity);
}

const amountLabel = amountWithUnit;

function portionRowToLoggedItem(row: PortionRow): LoggedFoodItem {
  if (row.foodId) {
    return { foodId: row.foodId, servingId: row.servingId, quantity: row.quantity };
  }
  return {
    customFood: {
      name: row.label.slice(0, 120),
      kcal: rowKcal(row) ?? 0,
      servingLabel: amountLabel(row.quantity, row.unitLabel).slice(0, 120),
    },
    // A plan food changed in amount is not a food the trainee created.
    saveToMyFoods: false,
  };
}

function initialRows(assignment: MealAssignment): PortionRow[] {
  return plannedRowsFromAssignment(assignment).map((row) => ({
    ...row,
    plannedQuantity: row.quantity,
  }));
}

/**
 * Something different (TR-08a): changed the portion (TR-08b), log it myself
 * (TR-26a) or ate out (TR-08c). In the bottom sheet each sub-screen gets a
 * real height (Z11b-5). The sheet follows the system theme itself so it
 * reads right when hosted outside Diet's ThemeScope (overlay Modal).
 */
export function SomethingDifferentSheet(props: Props) {
  return (
    <ThemeScope scheme="system" drivesSystemBars={false}>
      <SomethingDifferentSheetBody {...props} />
    </ThemeScope>
  );
}

function SomethingDifferentSheetBody({
  assignment,
  relationshipId,
  variant = "screen",
  coachName = "Your coach",
  onDone,
  onCancel,
  onOpenFoodSearch,
  onAskCoach,
  authorMode = "trainee",
  clientName,
  onCoachSave,
}: Props) {
  const styles = useStyles();
  const theme = useTheme();
  const sync = useSyncEngine();
  const { me } = useAuth();
  const timeZone = me?.timezone ?? "UTC";
  const { height: windowHeight } = useWindowDimensions();
  // In the sheet, BottomSheet hosts children in a flexGrow:0 ScrollView, so a
  // flex:1 sub-screen collapses to 0. Give it a real height there (Z11b-5).
  // Use flexGrow/flexShrink instead of `flex: 0`: react-native-web maps
  // `flex: 0` to CSS `0 1 0%`, which overrides height and collapses the view.
  const subScreenStyle =
    variant === "sheet"
      ? [
          styles.subScreen,
          {
            flexGrow: 0,
            flexShrink: 0,
            height: Math.min(520, Math.max(320, windowHeight * 0.75)),
          },
        ]
      : styles.subScreen;
  const isCoach = authorMode === "coach";
  const coachShort = coachName.split(/\s+/)[0] ?? coachName;
  const clientShort = (clientName ?? "Client").split(/\s+/)[0] ?? "Client";
  const mealName = cleanFoodLabel(assignment.mealName);

  const [screen, setScreen] = useState<ScreenId>("menu");
  const [portionRows, setPortionRows] = useState<PortionRow[]>(() => initialRows(assignment));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planKcal = useMemo(() => nutrientsFromMealPrescription(assignment).kcal, [assignment]);
  const mealSubtitle = `${mealName}${planKcal > 0 ? ` · plan ${formatNumber(planKcal)} kcal` : ""}`;

  const portionTotal = useMemo(() => {
    let kcal = 0;
    let unknown = false;
    for (const row of portionRows) {
      if (row.quantity <= 0) continue;
      const k = rowKcal(row);
      if (k == null) unknown = true;
      else kcal += k;
    }
    return { kcal, unknown };
  }, [portionRows]);
  const diff = portionTotal.unknown || planKcal <= 0 ? null : portionTotal.kcal - planKcal;

  function adjustPortion(index: number, delta: number) {
    setPortionRows((prev) =>
      prev.map((row, i) =>
        i === index
          ? { ...row, quantity: Math.min(PORTION_MAX, Math.max(0, row.quantity + delta)) }
          : row,
      ),
    );
  }

  function backToMenu() {
    setError(null);
    setScreen("menu");
  }

  async function savePortion() {
    const kept = portionRows.filter((row) => row.quantity > 0);
    if (kept.length === 0) {
      setError("Keep at least one food, or use another option.");
      return;
    }
    setSaving(true);
    setError(null);
    const items = kept.map(portionRowToLoggedItem);
    try {
      if (isCoach) {
        if (!onCoachSave) throw new Error("Coach save is not wired.");
        await onCoachSave({
          deviationKind: "portion_adjustment",
          notes: null,
          items,
        });
      } else {
        await deviateMealAssignment(
          sync,
          assignment,
          {
            deviationKind: "portion_adjustment",
            notes: null,
            photoIntent: null,
            items,
          },
          coachName,
          relationshipId,
        );
        announceMealSaved({
          relationshipId,
          assignmentId: assignment.id,
          localDate: assignment.localDate,
          mealName,
          kcal: portionTotal.unknown && portionTotal.kcal === 0 ? null : portionTotal.kcal,
          kind: "portion_adjustment",
        });
      }
      onDone();
    } catch (err) {
      reportError("SomethingDifferentSheet.savePortion", err);
      setError(
        userFacingMessage(err, {
          fallback: "Couldn’t save that meal. Try again.",
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  function option(opts: {
    icon: LucideIcon;
    title: string;
    subtitle: string;
    onPress: () => void;
  }) {
    const Icon = opts.icon;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={opts.title}
        accessibilityHint={opts.subtitle}
        onPress={opts.onPress}
        style={({ pressed }) => [styles.opt, pressed ? styles.optPressed : null]}
      >
        <View style={styles.optIcon}>
          <Icon size={20} strokeWidth={2} color={theme.colors.brand} />
        </View>
        <View style={styles.flex}>
          <Text variant="bodyStrong">{opts.title}</Text>
          <Text variant="subhead" style={styles.optSub}>
            {opts.subtitle}
          </Text>
        </View>
        <ChevronRight size={18} strokeWidth={2.2} color={theme.colors.ink4} />
      </Pressable>
    );
  }

  const menuBody = (
    <>
      {variant === "sheet" ? (
        <View style={styles.menuHead}>
          <View style={styles.flex}>
            <Text variant="title">What did you have instead?</Text>
            <Text variant="subhead">{mealSubtitle}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onCancel}
            style={styles.closeHit}
          >
            <View style={styles.closeCircle}>
              <X size={17} strokeWidth={2.4} color={theme.colors.ink3} />
            </View>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.options}>
        {option({
          icon: SlidersHorizontal,
          title: "Changed the portion",
          subtitle: "Same foods, more or less of each",
          onPress: () => {
            setError(null);
            setScreen("portion");
          },
        })}
        {option({
          icon: Search,
          title: "Log it myself",
          subtitle: "Search foods and set amounts",
          onPress: () => onOpenFoodSearch?.(),
        })}
        {option({
          icon: Store,
          title: "Ate out",
          subtitle: "Enter the kcal from the menu or label",
          onPress: () => {
            setError(null);
            setScreen("ate_out");
          },
        })}
      </View>
      {!isCoach && onAskCoach ? (
        <Pressable accessibilityRole="button" onPress={onAskCoach} style={styles.askCoach}>
          <MessageCircle size={16} strokeWidth={2.2} color={theme.colors.brand} />
          <Text variant="bodyStrong" tone="brand">
            Ask {coachShort} about this meal
          </Text>
        </Pressable>
      ) : null}
    </>
  );

  const ateOutBody = (
    <View testID="something-different-subscreen" style={subScreenStyle}>
      <AteOutForm
        assignment={assignment}
        relationshipId={relationshipId}
        coachName={coachName}
        timeZone={timeZone}
        onCancel={backToMenu}
        onSaved={onDone}
        authorMode={authorMode}
        clientName={clientName}
        onCoachSave={onCoachSave}
      />
    </View>
  );

  const portionBody = (
    <View testID="something-different-subscreen" style={subScreenStyle}>
      <FoodNavHeader
        title="Changed the portion"
        subtitle={`${mealName} · ${formatClockTime(assignment.windowStartsAt, timeZone)}`}
        onLeft={backToMenu}
        rightLabel="Save"
        onRight={() => void savePortion()}
        busy={saving}
      />
      <ScrollView
        style={styles.flexFill}
        contentContainerStyle={styles.portionContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="subhead" style={styles.portionIntro}>
          Change how much you had. Steps are ½.
        </Text>
        <View style={styles.group}>
          {portionRows.map((row, index) => {
            const kcal = rowKcal(row);
            return (
              <View key={`${row.label}-${index}`} style={styles.prow}>
                <View style={styles.flex}>
                  <Text variant="body">{row.label}</Text>
                  <Text variant="subhead" style={styles.prowMeta}>
                    Plan {amountLabel(row.plannedQuantity, row.unitLabel)}
                    {kcal != null ? (
                      <>
                        {" · "}
                        <Text variant="subhead" style={styles.strong}>
                          {formatNumber(kcal)} kcal
                        </Text>
                      </>
                    ) : null}
                  </Text>
                </View>
                <View style={styles.stepCol}>
                  <View style={styles.stepper}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Less ${row.label}`}
                      disabled={row.quantity <= 0}
                      onPress={() => adjustPortion(index, -PORTION_STEP)}
                      style={styles.stepBtn}
                    >
                      <Minus size={18} strokeWidth={2.4} color={theme.colors.ink} />
                    </Pressable>
                    <Text
                      variant="numberSm"
                      style={styles.stepValue}
                      accessibilityLabel={`${row.label}: ${amountLabel(row.quantity, row.unitLabel)}`}
                    >
                      {formatAmount(row.quantity)}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`More ${row.label}`}
                      onPress={() => adjustPortion(index, PORTION_STEP)}
                      style={styles.stepBtn}
                    >
                      <Plus size={18} strokeWidth={2.4} color={theme.colors.ink} />
                    </Pressable>
                  </View>
                  <Text variant="caption" style={styles.stepUnit}>
                    {unitNoun(row.unitLabel)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
        <View style={styles.portionMeta}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setPortionRows(initialRows(assignment))}
            style={styles.resetHit}
          >
            <RotateCcw size={15} strokeWidth={2.2} color={theme.colors.brand} />
            <Text variant="bodyStrong" tone="brand">
              Reset to plan
            </Text>
          </Pressable>
          <Text variant="subhead">
            {isCoach ? `${clientShort} sees this` : `${coachShort} sees the difference`}
          </Text>
        </View>
        {error ? <ErrorBanner message={error} /> : null}
      </ScrollView>
      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text variant="subhead">Total</Text>
          <View style={styles.totalRight}>
            <Text variant="numberMd">
              {portionTotal.unknown ? "at least " : ""}
              {formatNumber(portionTotal.kcal)} kcal
            </Text>
            {diff != null && diff !== 0 ? (
              <View style={[styles.diffTag, diff > 0 ? styles.diffOver : styles.diffUnder]}>
                <Text variant="caption" tone={diff > 0 ? "warnInk" : "done"} style={styles.strong}>
                  {diff > 0 ? "+" : "−"}
                  {formatNumber(Math.abs(diff))} vs plan
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saving, busy: saving }}
          disabled={saving}
          onPress={() => void savePortion()}
          style={[styles.primary, saving ? styles.busy : null]}
        >
          <Text variant="bodyStrong" tone="onBrand">
            Save portion
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const body = screen === "ate_out" ? ateOutBody : screen === "portion" ? portionBody : menuBody;

  if (variant === "sheet") {
    return <View style={styles.sheetBody}>{body}</View>;
  }

  if (screen !== "menu") {
    return (
      <Screen v3 title="" showHeader={false} chrome="app">
        {body}
      </Screen>
    );
  }

  return (
    <Screen v3 title="What did you have instead?" subtitle={mealSubtitle}>
      {body}
      <PrimaryButton label="Cancel" variant="ghost" onPress={onCancel} />
    </Screen>
  );
}

const useStyles = createThemedStyles((t) => ({
  sheetBody: { gap: 12, maxHeight: 560 },
  flex: { flex: 1, minWidth: 0 },
  flexFill: { flex: 1 },
  strong: { fontWeight: "600" },
  menuHead: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  closeHit: {
    alignItems: "center",
    height: t.touchTarget,
    justifyContent: "center",
    marginRight: -6,
    marginTop: -6,
    width: t.touchTarget,
  },
  closeCircle: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  options: { gap: 8, marginTop: 4 },
  opt: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line2,
    borderRadius: t.radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 72,
    padding: 14,
  },
  optPressed: { backgroundColor: t.colors.fill },
  optIcon: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  optSub: { fontSize: 13.5 },
  askCoach: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: 8,
    minHeight: t.touchTarget,
  },
  subScreen: { flex: 1, maxHeight: 520 },
  portionContent: { gap: 8, paddingBottom: 12 },
  portionIntro: { marginHorizontal: 2, marginTop: 8 },
  group: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line2,
    borderRadius: t.radii.group,
    borderWidth: 1,
    overflow: "hidden",
  },
  prow: {
    alignItems: "center",
    borderBottomColor: t.colors.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  prowMeta: { fontSize: 13 },
  stepCol: { alignItems: "center", flexShrink: 0, gap: 3 },
  stepper: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 12,
    flexDirection: "row",
  },
  stepBtn: {
    alignItems: "center",
    height: t.touchTarget,
    justifyContent: "center",
    width: t.touchTarget,
  },
  // Wide enough for "10½" without truncating (Z12-21).
  stepValue: { minWidth: 40, textAlign: "center" },
  stepUnit: { maxWidth: 140, textAlign: "center" },
  portionMeta: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
    marginTop: 8,
  },
  resetHit: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    minHeight: t.touchTarget,
  },
  footer: {
    borderTopColor: t.colors.line2,
    borderTopWidth: 1,
    gap: 10,
    paddingTop: 10,
  },
  totalRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  totalRight: { alignItems: "center", flexDirection: "row", gap: 8 },
  diffTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  diffUnder: { backgroundColor: t.colors.doneTint },
  diffOver: { backgroundColor: t.colors.warnTint },
  primary: {
    alignItems: "center",
    backgroundColor: t.colors.brand,
    borderRadius: t.radii.button,
    justifyContent: "center",
    minHeight: 52,
  },
  busy: { opacity: 0.6 },
}));
