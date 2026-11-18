import { useState } from "react";
import { ScrollView, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type { MealAssignment } from "@fitbud/contracts";
import { formatClockTime, formatNumber } from "@fitbud/core";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Text } from "../../components/Text";
import { reportError } from "../../lib/reportError";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import { useSyncEngine } from "../../sync/SyncProvider";
import { deviateMealAssignment, MealSyncError } from "../mealActions";
import { cleanFoodLabel } from "../mealHelpers";
import { nutrientsFromMealPrescription } from "../nutrition";
import { FoodNavHeader } from "./FoodNavHeader";
import { announceMealSaved } from "./mealSavedNotice";

/** The deviate body for an ate-out log: the kcal as one line, the note as notes. */
export function ateOutBody(kcal: number | null, note: string) {
  return {
    deviationKind: "restaurant" as const,
    notes: note.trim() || null,
    photoIntent: null,
    items: kcal != null ? [{ customFood: { name: "Ate out", kcal } }] : [],
  };
}

function parseKcal(text: string): number | null {
  const digits = text.replace(/[^\d]/g, "");
  if (!digits) return null;
  return Math.min(20000, Number(digits));
}

type Props = {
  assignment: MealAssignment;
  relationshipId: string;
  coachName: string;
  timeZone: string;
  onCancel: () => void;
  onSaved: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * TR-08c: what an eaten-out meal came to, from the menu, the bill or the
 * label. The kcal counts in the day ring; with only a note it stays unknown
 * ("at least"). Used from Something different and from a search with no match
 * (TR-26d "Log as Ate out").
 */
export function AteOutForm({
  assignment,
  relationshipId,
  coachName,
  timeZone,
  onCancel,
  onSaved,
  style,
}: Props) {
  const styles = useStyles();
  const theme = useTheme();
  const sync = useSyncEngine();
  const coachShort = coachName.split(/\s+/)[0] ?? coachName;
  const [kcalText, setKcalText] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const planKcal = nutrientsFromMealPrescription(assignment).kcal;
  const kcal = parseKcal(kcalText);
  const mealName = cleanFoodLabel(assignment.mealName);

  async function save() {
    if (kcal == null && !note.trim()) {
      setError("Enter the kcal, or a short note about what you had.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await deviateMealAssignment(
        sync,
        assignment,
        ateOutBody(kcal, note),
        coachName,
        relationshipId,
      );
      announceMealSaved({
        relationshipId,
        assignmentId: assignment.id,
        localDate: assignment.localDate,
        mealName,
        kcal,
        kind: "restaurant",
      });
      onSaved();
    } catch (err) {
      reportError("AteOutForm.save", err);
      setError(
        err instanceof MealSyncError || err instanceof ApiClientError
          ? err.message
          : "Couldn’t save that meal. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.root, style]} testID="ate-out-form">
      <FoodNavHeader
        title="Ate out"
        subtitle={`${mealName} · ${formatClockTime(assignment.windowStartsAt, timeZone)}`}
        onLeft={onCancel}
        rightLabel="Save"
        onRight={() => void save()}
        busy={saving}
      />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text variant="body" tone="ink2">
          How many kcal? Check the menu, the bill or the label.
        </Text>
        <View style={styles.kcalRow}>
          <TextInput
            value={kcal != null ? formatNumber(kcal) : ""}
            onChangeText={setKcalText}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={theme.colors.ink4}
            accessibilityLabel="Kcal"
            style={styles.kcalInput}
            testID="ate-out-kcal"
          />
          <Text variant="title" tone="ink3">
            kcal
          </Text>
        </View>
        {planKcal > 0 ? (
          <Text variant="caption" tone="ink2" style={styles.center}>
            {coachShort}’s plan for {mealName.toLowerCase()}: {formatNumber(planKcal)} kcal
          </Text>
        ) : null}
        <Text variant="bodyStrong" style={styles.noteLabel}>
          Note for {coachShort} (optional)
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Where, and what you had"
          placeholderTextColor={theme.colors.ink4}
          accessibilityLabel={`Note for ${coachShort}`}
          maxLength={500}
          style={styles.noteInput}
          testID="ate-out-note"
        />
        {error ? <ErrorBanner message={error} /> : null}
      </ScrollView>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  root: { backgroundColor: t.colors.bgPlain, flex: 1 },
  body: { gap: 12, paddingBottom: 24, paddingHorizontal: 20, paddingTop: 4 },
  kcalRow: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 12,
  },
  kcalInput: {
    color: t.colors.ink,
    fontSize: 56,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    letterSpacing: -1,
    minHeight: 72,
    minWidth: 80,
    paddingVertical: 0,
    textAlign: "right",
  },
  center: { textAlign: "center" },
  noteLabel: { marginTop: 12 },
  noteInput: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line2,
    borderRadius: t.radii.input + 2,
    borderWidth: 1,
    color: t.colors.ink,
    fontSize: 17,
    minHeight: 56,
    paddingHorizontal: 16,
  },
}));
