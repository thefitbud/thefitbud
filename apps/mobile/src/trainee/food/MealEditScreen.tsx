import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import { userFacingMessage } from "@fitbud/api-client";
import type { MealAssignment } from "@fitbud/contracts";
import { BottomSheet } from "../../components/BottomSheet";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Text } from "../../components/Text";
import { reportError } from "../../lib/reportError";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import { useSyncEngine } from "../../sync/SyncProvider";
import { FoodSearchScreen } from "../FoodSearchScreen";
import { SomethingDifferentSheet } from "../SomethingDifferentSheet";
import { removeMealEntry } from "../mealActions";
import { cleanFoodLabel } from "../mealHelpers";
import type { MealEditMode } from "./AteOutForm";

/** The coach's first name, as the copy says it ("Rahul sees that you removed it."). */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "Your coach";
}

/**
 * TR-07n3: the confirm before a logged entry is removed. The removal is one
 * outbox mutation; the meal goes back to not logged at once and can be logged
 * again.
 */
export function RemoveLogConfirm({
  meal,
  relationshipId,
  coachName,
  onRemoved,
  onCancel,
}: {
  meal: MealAssignment;
  relationshipId: string;
  coachName: string;
  onRemoved: () => void;
  onCancel: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const sync = useSyncEngine();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = cleanFoodLabel(meal.mealName);
  const coach = firstName(coachName);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await removeMealEntry(sync, meal, relationshipId);
      onRemoved();
    } catch (err) {
      reportError("MealEditScreen.remove", err);
      setError(
        userFacingMessage(err, { fallback: "Couldn’t remove that log. Try again." }),
      );
      setBusy(false);
    }
  }

  return (
    <BottomSheet visible headerless onDismiss={onCancel}>
      <View testID="remove-log-confirm">
        <Text variant="title" accessibilityRole="header">
          Remove the {name.toLowerCase()} log?
        </Text>
        <Text variant="body" tone="ink2" style={styles.body}>
          It goes back to not logged, so you can log it again. {coach} sees that you
          removed it.
        </Text>
        {error ? <ErrorBanner message={error} /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove log"
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          onPress={() => void confirm()}
          style={[styles.remove, busy ? styles.busy : null]}
          testID="remove-log-confirm-yes"
        >
          {busy ? (
            <ActivityIndicator color={theme.colors.crit} />
          ) : (
            <Text variant="bodyStrong" tone="crit">
              Remove log
            </Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Keep it"
          onPress={onCancel}
          style={styles.keep}
          testID="remove-log-confirm-keep"
        >
          <Text variant="bodyStrong">Keep it</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

type View_ = "flow" | "food";

/** Which screen "Edit" opens first, from how the entry was logged (D-W14-22 b). */
export function editStart(meal: MealAssignment): "menu" | "portion" | "ate_out" | "food" {
  const entry = meal.compliance;
  if (!entry || entry.outcome !== "modified") return "menu";
  if (entry.deviationKind === "portion_adjustment") return "portion";
  if (entry.deviationKind === "restaurant") return "ate_out";
  if (entry.deviationKind === "logged_foods") return "food";
  return "menu";
}

/**
 * Z14-13b (D-W14-22): change a logged entry for 24 hours. An "Eaten as planned"
 * entry opens TR-07n2 "Change this log"; a changed-portion entry opens TR-07n4,
 * a food-search entry opens food search with its foods, an ate-out entry
 * TR-07n5. Every path saves as an edit of the entry, never a new log.
 */
export function MealEditScreen({
  meal,
  relationshipId,
  coachName,
  canRemove,
  onClose,
  onEdited,
  onRemoved,
}: {
  meal: MealAssignment;
  relationshipId: string;
  coachName: string;
  /** The server's `canRemove`: Remove is offered only while the meal could be logged again. */
  canRemove: boolean;
  onClose: () => void;
  onEdited: (info: { kcal: number | null }) => void;
  onRemoved: () => void;
}) {
  const start = editStart(meal);
  const [view, setView] = useState<View_>(start === "food" ? "food" : "flow");
  const [confirmRemove, setConfirmRemove] = useState(false);

  const edit: MealEditMode = {
    start: start === "food" ? "menu" : start,
    canRemove,
    onRemove: () => setConfirmRemove(true),
    onEdited,
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      {view === "food" ? (
        <FoodSearchScreen
          assignment={meal}
          relationshipId={relationshipId}
          coachName={coachName}
          onBack={onClose}
          onSaved={onClose}
          edit={edit}
        />
      ) : (
        <SomethingDifferentSheet
          assignment={meal}
          relationshipId={relationshipId}
          coachName={coachName}
          variant="screen"
          onDone={onClose}
          onCancel={onClose}
          onOpenFoodSearch={() => setView("food")}
          edit={edit}
        />
      )}
      {confirmRemove ? (
        <RemoveLogConfirm
          meal={meal}
          relationshipId={relationshipId}
          coachName={coachName}
          onRemoved={onRemoved}
          onCancel={() => setConfirmRemove(false)}
        />
      ) : null}
    </Modal>
  );
}

const useStyles = createThemedStyles((t) => ({
  body: { marginBottom: 16, marginTop: 8 },
  remove: {
    alignItems: "center",
    backgroundColor: t.colors.critTint,
    borderRadius: t.radii.button,
    justifyContent: "center",
    minHeight: 52,
  },
  busy: { opacity: 0.6 },
  keep: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    minHeight: t.touchTarget,
  },
}));
