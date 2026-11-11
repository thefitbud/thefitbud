import { Pressable, StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";
import { colors } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
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
  onComplete: () => void;
  /** Disables the tick on the row being edited (for example while paused). */
  completeDisabled?: boolean;
};

/** Column header of the set table. Pass showPrevious={false} to match a row without it. */
export function SetEntryHeader({ showPrevious = true }: { showPrevious?: boolean }) {
  return (
    <View style={styles.stabTh}>
      <Text style={styles.thCell}>Set</Text>
      {showPrevious ? (
        <Text style={[styles.thCell, styles.thWide]}>Previous</Text>
      ) : (
        <View style={styles.thWide} />
      )}
      <Text style={[styles.thCell, styles.thCenter]}>Load</Text>
      <Text style={[styles.thCell, styles.thCenter]}>Reps</Text>
      <Text style={styles.thCell} />
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
  completeDisabled = false,
}: RowProps) {
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
      {isNow ? (
        <View style={styles.valEditWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Set ${set.order} load: ${loadCellText(set, draft)}${loadCellIsKg(draft) ? " kg" : ""}`}
            onPress={() => onOpenField("load")}
            style={[
              styles.valInput,
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
      {isNow ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Set ${set.order} reps: ${draft.reps || "none"}`}
          onPress={() => onOpenField("reps")}
          style={[
            styles.valInput,
            styles.valReps,
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
          color={isOk || isNow ? colors.white : colors.midGrey}
          size={22}
          strokeWidth={2.6}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stabTh: {
    flexDirection: "row",
    gap: 6,
    paddingBottom: 4,
    paddingHorizontal: 6,
  },
  thCell: {
    color: colors.midGrey,
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
    backgroundColor: "#F9F7FF",
  },
  trNow: {
    backgroundColor: colors.white,
    borderColor: colors.indigo,
    borderWidth: 1.5,
  },
  stabNo: {
    color: colors.midGrey,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
    width: 34,
  },
  stabNoNow: {
    color: colors.indigo,
  },
  stabPrev: {
    color: colors.midGrey,
    flex: 1,
    fontSize: 14,
  },
  valStatic: {
    color: colors.midGrey,
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
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 12,
    borderWidth: 1.5,
    color: colors.deepNavy,
    fontSize: 18,
    fontWeight: "700",
    height: 44,
    justifyContent: "center",
    width: 76,
  },
  valInputText: {
    color: colors.deepNavy,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  valUnit: { fontSize: 12, fontWeight: "600" },
  valActive: { borderColor: colors.indigo, borderWidth: 2 },
  valBw: { backgroundColor: "#ECE9FF", borderColor: "#ECE9FF" },
  valBwText: { color: colors.indigo, fontSize: 14 },
  valStaticBw: { fontSize: 14 },
  valReps: {
    fontSize: 17,
    width: 64,
  },
  modBadge: {
    color: colors.indigo,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginTop: 2,
  },
  ck: {
    alignItems: "center",
    borderColor: colors.lightGrey,
    borderRadius: 14,
    borderWidth: 1.5,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  ckOk: {
    backgroundColor: colors.deepNavy,
    borderColor: colors.deepNavy,
  },
  ckNow: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
});
