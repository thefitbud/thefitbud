import { Pressable, View } from "react-native";
import { Check } from "lucide-react-native";
import { Text } from "../../components/Text";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import {
  displayLoad,
  isBodyweightLabel,
  loadCellIsKg,
  loadCellText,
  type KeypadField,
  type SetDraft,
  type SetPlan,
} from "./setEntry";

export type SetEntryRowSet = SetPlan & {
  id: string;
  order: number;
  /** Anything but "pending" is a logged row. */
  status: string;
  actualLoadLabel?: string | null;
  actualReps?: number | null;
};

type RowProps = {
  set: SetEntryRowSet;
  /** The row being edited: it shows the draft and opens the keypad. */
  isNow: boolean;
  draft: SetDraft;
  /** Shows the EDITED badge under the load cell. */
  modified?: boolean;
  /** The field whose keypad is open, if any. */
  activeField?: KeypadField | null;
  /** Text of the "Previous" column; omit to hide the column. */
  previousLabel?: string;
  onOpenField: (field: KeypadField) => void;
  /** Omit to hide the tick (the trainer form saves the whole workout at once). */
  onComplete?: () => void;
  /**
   * Whether the load and reps cells are inputs. Defaults to `isNow`; the trainer
   * form passes true for every row while `isNow` stays the current-row styling.
   */
  editable?: boolean;
  /** Grey filled input cells (the trainer log form) instead of outlined ones. */
  filled?: boolean;
  /** Disables the tick on the row being edited (for example while paused). */
  completeDisabled?: boolean;
};

/** Column header of the set table. Pass showPrevious={false} to match a row without it. */
export function SetEntryHeader({
  showPrevious = true,
  secondColumnLabel = "Previous",
  showTick = true,
}: {
  showPrevious?: boolean;
  /** Label of the second column, "Previous" by default ("Planned" in the trainer form). */
  secondColumnLabel?: string;
  /** Pass false to match rows without the tick column. */
  showTick?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={styles.stabTh}>
      <Text style={styles.thCell}>Set</Text>
      {showPrevious ? (
        <Text style={[styles.thCell, styles.thWide]}>{secondColumnLabel}</Text>
      ) : (
        <View style={styles.thWide} />
      )}
      <Text style={[styles.thCell, styles.thCenter]}>Load</Text>
      <Text style={[styles.thCell, styles.thCenter]}>Reps</Text>
      {showTick ? <Text style={styles.thCell} /> : null}
    </View>
  );
}

/** One set of the table: number, previous, load, reps and the tick (frames 11 / 11c). */
export function SetEntryRow({
  set,
  isNow,
  draft,
  modified = false,
  activeField = null,
  previousLabel,
  onOpenField,
  onComplete,
  editable,
  filled = false,
  completeDisabled = false,
}: RowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const isEditable = editable ?? isNow;
  const isOk = set.status !== "pending";
  const shownLoadLabel = isOk
    ? set.actualLoadLabel ?? set.prescribedLoadLabel
    : set.prescribedLoadLabel;
  const staticBw = isBodyweightLabel(shownLoadLabel);
  return (
    <View
      style={[
        styles.stabTr,
        isOk ? styles.trOk : null,
        isNow ? styles.trNow : null,
      ]}
    >
      <Text style={[styles.stabNo, isNow ? styles.stabNoNow : null]}>
        {set.order}
      </Text>
      {previousLabel !== undefined ? (
        <Text style={styles.stabPrev} numberOfLines={1}>
          {previousLabel}
        </Text>
      ) : (
        <View style={styles.stabPrev} />
      )}
      {isEditable ? (
        <View style={styles.valEditWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Set ${set.order} load: ${loadCellText(set, draft)}${loadCellIsKg(draft) ? " kg" : ""}`}
            onPress={() => onOpenField("load")}
            style={[
              styles.valInput,
              filled ? styles.valFilled : null,
              draft.bodyweight ? styles.valBw : null,
              activeField === "load" ? styles.valActive : null,
            ]}
          >
            <Text
              style={[
                styles.valInputText,
                draft.bodyweight ? styles.valBwText : null,
              ]}
              numberOfLines={1}
            >
              {loadCellText(set, draft)}
              {!loadCellIsKg(draft) ? "" : (
                <Text style={styles.valUnit}> kg</Text>
              )}
            </Text>
          </Pressable>
          {modified ? <Text style={styles.modBadge}>EDITED</Text> : null}
        </View>
      ) : (
        <Text style={[styles.valStatic, staticBw ? styles.valStaticBw : null]}>
          {staticBw ? "Bodyweight" : displayLoad(shownLoadLabel)}
        </Text>
      )}
      {isEditable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Set ${set.order} reps: ${draft.reps || "none"}`}
          onPress={() => onOpenField("reps")}
          style={[
            styles.valInput,
            styles.valReps,
            filled ? styles.valFilled : null,
            activeField === "reps" ? styles.valActive : null,
          ]}
        >
          <Text style={styles.valInputText}>{draft.reps}</Text>
        </Pressable>
      ) : (
        <Text style={styles.valStatic}>
          {isOk
            ? set.actualReps ?? set.prescribedReps ?? "—"
            : set.prescribedReps ?? "—"}
        </Text>
      )}
      {onComplete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isOk ? `Set ${set.order} logged` : `Log set ${set.order}`
          }
          disabled={!isNow || completeDisabled || set.status !== "pending"}
          onPress={onComplete}
          style={[styles.ck, isOk ? styles.ckOk : null, isNow ? styles.ckNow : null]}
        >
          <Check
            color={
              isOk || isNow ? theme.colors.onBrand : theme.colors.ink3
            }
            size={22}
            strokeWidth={2.6}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  stabTh: {
    flexDirection: "row",
    gap: 6,
    paddingBottom: 4,
    paddingHorizontal: 6,
  },
  thCell: {
    color: t.colors.ink3,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    width: 34,
  },
  thWide: {
    flex: 1,
    width: undefined,
  },
  thCenter: {
    textAlign: "center",
    width: 76,
  },
  stabTr: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
    minHeight: 56,
    paddingHorizontal: 6,
  },
  trOk: {
    backgroundColor: t.colors.brandTint,
  },
  trNow: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.brand,
    borderWidth: 1.5,
  },
  stabNo: {
    color: t.colors.ink3,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
    width: 34,
  },
  stabNoNow: {
    color: t.colors.brand,
  },
  stabPrev: {
    color: t.colors.ink3,
    flex: 1,
    fontSize: 14,
  },
  valStatic: {
    color: t.colors.ink3,
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
    width: 76,
  },
  valEditWrap: {
    alignItems: "center",
    width: 76,
  },
  valInput: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 12,
    borderWidth: 1.5,
    color: t.colors.ink,
    fontSize: 18,
    fontWeight: "700",
    height: 44,
    justifyContent: "center",
    width: 76,
  },
  valInputText: {
    color: t.colors.ink,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  valUnit: { fontSize: 12, fontWeight: "600" },
  valFilled: {
    backgroundColor: t.colors.fill,
    borderColor: t.colors.fill,
  },
  valActive: { borderColor: t.colors.brand, borderWidth: 2 },
  valBw: {
    backgroundColor: t.colors.brandTint,
    borderColor: t.colors.brandTint,
  },
  valBwText: { color: t.colors.brand, fontSize: 14 },
  valStaticBw: { fontSize: 14 },
  valReps: {
    fontSize: 17,
    width: 64,
  },
  modBadge: {
    color: t.colors.brand,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginTop: 2,
  },
  ck: {
    alignItems: "center",
    borderColor: t.colors.line,
    borderRadius: 14,
    borderWidth: 1.5,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  ckOk: {
    backgroundColor: t.colors.ink,
    borderColor: t.colors.ink,
  },
  ckNow: {
    backgroundColor: t.colors.brand,
    borderColor: t.colors.brand,
  },
}));
