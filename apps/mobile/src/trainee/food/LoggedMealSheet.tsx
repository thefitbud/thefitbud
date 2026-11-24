import { Pressable, View } from "react-native";
import { Camera, Clock, Lock, MessageCircle, Pencil, X } from "lucide-react-native";
import type { MealAssignment, MealComplianceLoggedItem } from "@fitbud/contracts";
import { formatCivilDate, formatClockTime, formatLocalDate, formatNumber } from "@fitbud/core";
import { BottomSheet } from "../../components/BottomSheet";
import { Text } from "../../components/Text";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import { mealEditUntilLabel, type MealEditState } from "../mealActions";
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
 * A logged meal (opened from its card or the TR-26f toast's View): what was
 * logged, item by item, with its kcal. For 24 hours the trainee can Edit it,
 * Add photo or Remove this log (TR-07n); after that it is read only with a way
 * to ask the coach (TR-07n7). Every button comes from the server's
 * `editableUntil` / `canRemove` (`MealEditState`).
 */
export function LoggedMealSheet({
  meal,
  coachName,
  timeZone,
  waitingToSend,
  onClose,
  onClosed,
  edit,
  onEdit,
  onAddPhoto,
  onRemove,
  onAskCoach,
}: {
  meal: MealAssignment;
  coachName: string;
  timeZone: string;
  /** Saved on this phone, not sent: the server's copy is not here yet. */
  waitingToSend: boolean;
  onClose: () => void;
  /** iOS: the sheet has finished leaving (open the next screen from here). */
  onClosed?: () => void;
  edit?: MealEditState;
  onEdit?: () => void;
  onAddPhoto?: () => void;
  onRemove?: () => void;
  onAskCoach?: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const compliance = meal.compliance;
  const items = compliance?.loggedItems ?? [];
  const kcal = compliance?.loggedTotals?.energyKcal ?? null;
  const totals = compliance?.loggedTotals;
  const macrosKnown =
    totals != null && (totals.proteinG != null || totals.carbsG != null || totals.fatG != null);
  const loggedDay = compliance ? formatLocalDate(new Date(compliance.loggedAt), timeZone) : null;
  const dayLead =
    loggedDay && loggedDay !== formatLocalDate(new Date(), timeZone)
      ? `${formatCivilDate(loggedDay, { includeWeekday: true })} \u00b7 `
      : "";
  const how =
    meal.status === "modified"
      ? compliance?.deviationKind === "portion_adjustment" || !compliance?.deviationKind
        ? "Changed from the plan"
        : deviationLabel(compliance.deviationKind)
      : "Eaten as planned";
  const subtitle = waitingToSend
    ? "Saved on your phone \u00b7 not sent yet"
    : compliance
      ? `${dayLead}${dayLead ? "logged" : how + " \u00b7 logged"} ${formatClockTime(
          compliance.loggedAt,
          timeZone,
        )}`
      : null;
  const coachFirst = coachName.trim().split(/\s+/)[0] || "Your coach";

  return (
    <BottomSheet visible headerless onDismiss={onClose} onClosed={onClosed}>
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
        {edit?.canEdit || edit?.locked ? null : (
          <Text variant="caption">{coachName} sees the changes</Text>
        )}
      </View>

      {edit?.canEdit && edit.until ? (
        <View style={styles.hint} testID="logged-meal-editable">
          <Clock size={16} strokeWidth={2} color={theme.colors.ink3} />
          <Text variant="subhead" style={styles.hintText}>
            Editable until {mealEditUntilLabel(edit.until, timeZone)} · {coachFirst} sees any
            change
          </Text>
        </View>
      ) : null}
      {edit?.canEdit && onEdit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit"
          onPress={onEdit}
          style={styles.editBtn}
          testID="logged-meal-edit"
        >
          <Pencil size={18} strokeWidth={2} color={theme.colors.ink} />
          <Text variant="bodyStrong">Edit</Text>
        </Pressable>
      ) : null}
      {edit?.canEdit && (onAddPhoto || (edit.canRemove && onRemove)) ? (
        <View style={styles.pair}>
          {onAddPhoto ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add photo"
              onPress={onAddPhoto}
              style={[styles.editBtn, styles.pairBtn]}
              testID="logged-meal-add-photo"
            >
              <Camera size={18} strokeWidth={2} color={theme.colors.ink} />
              <Text variant="bodyStrong">Add photo</Text>
            </Pressable>
          ) : null}
          {edit.canRemove && onRemove ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove this log"
              onPress={onRemove}
              style={[styles.removeBtn, styles.pairBtn]}
              testID="logged-meal-remove"
            >
              <Text variant="bodyStrong" tone="crit">
                Remove this log
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {edit?.locked ? (
        <>
          <View style={styles.lockNote} testID="logged-meal-locked">
            <Lock size={18} strokeWidth={1.9} color={theme.colors.ink3} />
            <Text variant="body" style={styles.hintText}>
              Logged entries can be changed for 24 hours.
            </Text>
          </View>
          {onAskCoach ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ask ${coachFirst} to fix it`}
              onPress={onAskCoach}
              style={styles.askBtn}
              testID="logged-meal-ask-coach"
            >
              <MessageCircle size={18} strokeWidth={2} color={theme.colors.ink} />
              <Text variant="bodyStrong">Ask {coachFirst} to fix it</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
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
  hint: { alignItems: "center", flexDirection: "row", gap: 8, marginHorizontal: 4, marginTop: 14 },
  hintText: { flex: 1 },
  editBtn: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: t.radii.button,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 52,
  },
  removeBtn: {
    alignItems: "center",
    backgroundColor: t.colors.critTint,
    borderRadius: t.radii.button,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 52,
  },
  pair: { flexDirection: "row", gap: 10 },
  pairBtn: { flex: 1 },
  lockNote: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: t.radii.card,
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  askBtn: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 8,
    minHeight: 52,
  },
  foot: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginHorizontal: 4,
    marginTop: 10,
  },
}));
