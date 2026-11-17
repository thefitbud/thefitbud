import { Pressable, View } from "react-native";
import { X } from "lucide-react-native";
import type { MealAssignment } from "@fitbud/contracts";
import { formatClockTime, formatKcal } from "@fitbud/core";
import { BottomSheet } from "../components/BottomSheet";
import { Text } from "../components/Text";
import { plannedRowsFromAssignment } from "../lib/plannedMealItems";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";
import { cleanFoodLabel } from "./mealHelpers";
import { nutrientsFromMealPrescription } from "./nutrition";

/**
 * Read-only planned meal detail (TR-07j without its actions; D-W12-7, Z12-39).
 *
 * Opened from a planned meal on a future day: what the coach planned, item by
 * item, and nothing to log. It takes the host screen's theme rather than
 * opting in to the system scheme on its own, so it always matches the screen
 * under it.
 */
export function PlannedMealSheet({
  meal,
  coachName,
  timeZone,
  onClose,
}: {
  meal: MealAssignment;
  coachName: string;
  timeZone: string;
  onClose: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const rows = plannedRowsFromAssignment(meal);
  const macros = nutrientsFromMealPrescription(meal);
  // A meal with no listed foods (instructions only) has no totals to show.
  const kcalKnown = rows.length > 0 && (!macros.unknown || macros.kcal > 0);
  const subtitle = [
    `Planned for ${formatClockTime(meal.windowStartsAt, timeZone)}`,
    kcalKnown ? formatKcal(macros.kcal) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const instructions = meal.prescription.instructions?.trim();

  return (
    <BottomSheet visible headerless onDismiss={onClose}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text variant="title" accessibilityRole="header">
            {cleanFoodLabel(meal.mealName)}
          </Text>
          <Text variant="subhead">{subtitle}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={styles.close}
        >
          <X size={20} strokeWidth={2.2} color={theme.colors.ink} />
        </Pressable>
      </View>

      {rows.length > 0 ? (
        <View style={styles.group}>
          {rows.map((row, index) => (
            <View
              key={`${row.label}-${index}`}
              style={[styles.row, index > 0 ? styles.rowRule : null]}
            >
              <View style={styles.rowText}>
                <Text variant="body">{row.label}</Text>
                <Text variant="subhead">
                  {row.quantity !== 1
                    ? `${row.quantity} × ${row.unitLabel}`
                    : row.unitLabel}
                </Text>
              </View>
              {row.kcalPreview != null ? (
                <Text variant="bodyStrong" style={styles.kcal}>
                  {formatKcal(row.kcalPreview)}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : instructions ? (
        <View style={styles.group}>
          <View style={styles.row}>
            <Text variant="body" style={styles.rowText}>
              {instructions}
            </Text>
          </View>
        </View>
      ) : null}

      <Text variant="caption" style={styles.foot}>
        {kcalKnown
          ? `P ${macros.protein} g · C ${macros.carbs} g · F ${macros.fat} g · from ${coachName}’s plan`
          : `From ${coachName}’s plan`}
      </Text>
    </BottomSheet>
  );
}

const useStyles = createThemedStyles((t) => ({
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  headText: { flex: 1, gap: 2 },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.colors.fill,
  },
  group: {
    backgroundColor: t.colors.bg,
    borderRadius: t.radii.group,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  rowRule: {
    borderTopWidth: 1,
    borderTopColor: t.colors.line,
  },
  rowText: { flex: 1, gap: 2 },
  kcal: { fontVariant: ["tabular-nums"] },
  foot: { marginTop: 12, marginHorizontal: 4 },
}));
