import { Pressable, View } from "react-native";
import { X } from "lucide-react-native";
import type { MealAssignment, MealComplianceLoggedItem } from "@fitbud/contracts";
import { formatClockTime, formatNumber } from "@fitbud/core";
import { BottomSheet } from "../../components/BottomSheet";
import { Text } from "../../components/Text";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import { cleanFoodLabel } from "../mealHelpers";
import { amountWithUnit, formatAmount } from "./logLines";

/** How a changed meal was logged, as the row and this sheet name it. */
export function deviationLabel(kind: string | null | undefined): string {
  if (kind === "logged_foods") return "Logged myself";
  if (kind === "restaurant") return "Ate out";
  return "Changed";
}

function itemAmount(item: MealComplianceLoggedItem): string | null {
  const serving = item.servingLabel ? cleanFoodLabel(item.servingLabel) : null;
  if (item.quantity != null && item.quantity !== 1) {
    return serving ? amountWithUnit(item.quantity, serving) : formatAmount(item.quantity);
  }
  return serving;
}

/**
 * A logged meal, read only (opened from the TR-26f toast's View): what was
 * logged, item by item, with its kcal. Editing and deleting stay on the
 * meal's Change action.
 */
export function LoggedMealSheet({
  meal,
  coachName,
  timeZone,
  waitingToSend,
  onClose,
}: {
  meal: MealAssignment;
  coachName: string;
  timeZone: string;
  /** Saved on this phone, not sent: the server's copy is not here yet. */
  waitingToSend: boolean;
  onClose: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const compliance = meal.compliance;
  const items = compliance?.loggedItems ?? [];
  const kcal = compliance?.loggedTotals?.energyKcal ?? null;
  const totals = compliance?.loggedTotals;
  const macrosKnown =
    totals != null && (totals.proteinG != null || totals.carbsG != null || totals.fatG != null);
  const subtitle = waitingToSend
    ? "Saved on your phone · not sent yet"
    : compliance
      ? `Logged ${formatClockTime(compliance.loggedAt, timeZone)} · ${deviationLabel(
          compliance.deviationKind,
        ).toLowerCase()}`
      : null;

  return (
    <BottomSheet visible headerless onDismiss={onClose}>
      <View style={styles.head} testID="logged-meal-sheet">
        <View style={styles.headText}>
          <Text variant="title" accessibilityRole="header">
            {cleanFoodLabel(meal.mealName)}
          </Text>
          {subtitle ? <Text variant="subhead">{subtitle}</Text> : null}
        </View>
        {kcal != null ? (
          <View style={styles.kcal}>
            <Text variant="numberLg">{formatNumber(kcal)}</Text>
            <Text variant="caption">kcal</Text>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={styles.close}
        >
          <X size={20} strokeWidth={2.2} color={theme.colors.ink} />
        </Pressable>
      </View>

      {items.length > 0 ? (
        <View style={styles.group}>
          {items.map((item, index) => {
            const amount = itemAmount(item);
            return (
              <View
                key={`${item.name}-${index}`}
                style={[styles.row, index > 0 ? styles.rowRule : null]}
              >
                <View style={styles.rowText}>
                  <Text variant="body">{cleanFoodLabel(item.name)}</Text>
                  {amount ? <Text variant="subhead">{amount}</Text> : null}
                </View>
                {item.energyKcal != null ? (
                  <Text variant="numberSm">
                    {formatNumber(Math.round(item.energyKcal))}
                    <Text variant="caption"> kcal</Text>
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : compliance?.notes ? (
        <View style={styles.group}>
          <View style={styles.row}>
            <Text variant="body" style={styles.rowText}>
              {compliance.notes}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.foot}>
        {macrosKnown ? (
          <Text variant="subhead">
            P {formatNumber(Math.round(totals?.proteinG ?? 0))} g · C{" "}
            {formatNumber(Math.round(totals?.carbsG ?? 0))} g · F{" "}
            {formatNumber(Math.round(totals?.fatG ?? 0))} g
          </Text>
        ) : (
          <View />
        )}
        <Text variant="caption">{coachName} sees the changes</Text>
      </View>
    </BottomSheet>
  );
}

const useStyles = createThemedStyles((t) => ({
  head: { alignItems: "flex-start", flexDirection: "row", gap: 12, marginBottom: 14 },
  headText: { flex: 1, gap: 2 },
  kcal: { alignItems: "flex-end" },
  close: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  group: { backgroundColor: t.colors.bg, borderRadius: t.radii.group, overflow: "hidden" },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowRule: { borderTopColor: t.colors.line, borderTopWidth: 1 },
  rowText: { flex: 1, gap: 2 },
  foot: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginHorizontal: 4,
    marginTop: 10,
  },
}));
