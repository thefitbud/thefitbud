/**
 * Sheets and dialogs of the active log (Z12-45): the exercise ⋯ menu (W-09),
 * the set sheet (W-13), "Finish early?" (W-16) and the confirm dialog used by
 * Discard (W-15) and "Pick up where you left off?" (W-18).
 */
import { useEffect, useState, type ReactNode } from "react";
import { Modal, Pressable, TextInput, View } from "react-native";
import {
  ChevronRight,
  CirclePlay,
  Clock,
  Dumbbell,
  MessageCircle,
  SkipForward,
} from "lucide-react-native";
import { BottomSheet } from "../../../components/BottomSheet";
import { Button, type ButtonVariant } from "../../../components/Button";
import { Text } from "../../../components/Text";
import {
  createThemedStyles,
  shadowColor,
  useTheme,
} from "../../../providers/ThemeProvider";
import {
  MAX_LOAD_KG,
  MAX_REPS,
  isBodyweightLabel,
  plainKgFromLabel,
  type SetDraft,
} from "../../../workout/shared";
import type { UnloggedExercise } from "../../workoutSession";

/* ------------------------------------------------------- exercise menu */

export function ExerciseMenuSheet({
  visible,
  name,
  planLine,
  coachFirst,
  canSkip,
  onHowTo,
  onHistory,
  onAskCoach,
  onSkip,
  onDismiss,
}: {
  visible: boolean;
  name: string;
  planLine: string;
  coachFirst: string;
  /** False once nothing of the exercise is left to do. */
  canSkip: boolean;
  onHowTo: () => void;
  onHistory: () => void;
  /** Omitted when the screen has no way to open the coach message. */
  onAskCoach?: () => void;
  onSkip: () => void;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const coach = coachFirst === "your coach" ? "Your coach" : coachFirst;
  const icon = (node: ReactNode) => <View style={styles.menuIcon}>{node}</View>;
  return (
    <BottomSheet visible={visible} headerless onDismiss={onDismiss}>
      <View style={styles.menuHead}>
        <View style={styles.tile}>
          <Dumbbell color={theme.colors.brand} size={20} strokeWidth={2} />
        </View>
        <View style={styles.flex1}>
          <Text variant="headline" accessibilityRole="header">
            {name}
          </Text>
          {planLine ? <Text variant="subhead">{planLine}</Text> : null}
        </View>
      </View>
      <View style={styles.group}>
        <MenuRow
          icon={icon(<CirclePlay color={theme.colors.ink2} size={18} strokeWidth={2} />)}
          title="How to do it"
          chevron
          onPress={onHowTo}
        />
        <MenuRow
          icon={icon(<Clock color={theme.colors.ink2} size={18} strokeWidth={2} />)}
          title="History and records"
          chevron
          onPress={onHistory}
        />
        {onAskCoach ? (
          <MenuRow
            icon={icon(
              <MessageCircle color={theme.colors.ink2} size={18} strokeWidth={2} />,
            )}
            title={`Ask ${coachFirst === "your coach" ? "your coach" : coachFirst} about this`}
            subtitle="Opens a WhatsApp message you send"
            chevron
            onPress={onAskCoach}
          />
        ) : null}
        {canSkip ? (
          <MenuRow
            icon={icon(
              <SkipForward color={theme.colors.ink2} size={18} strokeWidth={2} />,
            )}
            title="Skip exercise"
            subtitle={`${coach} sees it as skipped`}
            onPress={onSkip}
          />
        ) : null}
      </View>
    </BottomSheet>
  );
}

function MenuRow({
  icon,
  title,
  subtitle,
  chevron = false,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  chevron?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      onPress={onPress}
      style={styles.menuRow}
    >
      {icon}
      <View style={styles.flex1}>
        <Text variant="body">{title}</Text>
        {subtitle ? (
          <Text variant="subhead" style={styles.small}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {chevron ? (
        <ChevronRight color={theme.colors.ink4} size={18} strokeWidth={2.2} />
      ) : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------ set sheet */

export type SetSheetMode = "logged" | "skipped" | "pending";

function cleanLoad(text: string): string {
  const cleaned = text.replace(",", ".").replace(/[^\d.]/g, "");
  const [whole = "", ...rest] = cleaned.split(".");
  const decimals = rest.join("").slice(0, 2);
  const next = rest.length > 0 ? `${whole}.${decimals}` : whole;
  return Number(next) > MAX_LOAD_KG ? String(MAX_LOAD_KG) : next;
}

function cleanReps(text: string): string {
  const digits = text.replace(/\D/g, "").replace(/^0+/, "");
  return Number(digits) > MAX_REPS ? String(MAX_REPS) : digits;
}

/**
 * W-13. A logged set: change kg and reps, or mark it not done. A skipped set:
 * log it after all. A set still to do: skip it (the swipe action of W-08, for
 * anyone who cannot swipe).
 */
export function SetSheet({
  visible,
  mode,
  title,
  detail,
  set,
  coachFirst,
  onSave,
  onMarkNotDone,
  onSkip,
  onDismiss,
}: {
  visible: boolean;
  mode: SetSheetMode;
  /** "Set 2 · Romanian deadlift". */
  title: string;
  /** "Logged 42.5 kg × 10 at 6:51 pm · PR", "Skipped", "Not logged yet". */
  detail: string;
  set: {
    prescribedReps: number | null;
    prescribedLoadLabel: string | null;
    actualReps: number | null;
    actualLoadLabel: string | null;
  } | null;
  coachFirst: string;
  onSave: (draft: SetDraft) => void;
  onMarkNotDone: () => void;
  onSkip: () => void;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const loadLabel =
    mode === "logged"
      ? (set?.actualLoadLabel ?? set?.prescribedLoadLabel)
      : set?.prescribedLoadLabel;
  const bodyweight = isBodyweightLabel(loadLabel);
  const plainKg = plainKgFromLabel(loadLabel);
  // A load that is neither bodyweight nor one plain weight ("RPE 7") stays as it is.
  const kgEditable = !bodyweight && plainKg !== "";
  const startReps =
    mode === "logged" ? (set?.actualReps ?? set?.prescribedReps) : set?.prescribedReps;
  const [load, setLoad] = useState(plainKg);
  const [reps, setReps] = useState(startReps != null ? String(startReps) : "");
  const [focus, setFocus] = useState<"load" | "reps" | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoad(plainKg);
    setReps(startReps != null ? String(startReps) : "");
    setFocus(null);
    // Reset only when the sheet opens on a set.
  }, [visible, title]);

  const repsValid = reps.trim() !== "" && Number(reps) >= 1;
  const loadValid = !kgEditable || (load.trim() !== "" && Number.isFinite(Number(load)));
  const coach = coachFirst === "your coach" ? "Your coach" : coachFirst;

  return (
    <BottomSheet visible={visible} headerless onDismiss={onDismiss}>
      <View>
        <Text variant="headline" accessibilityRole="header">
          {title}
        </Text>
        <Text variant="subhead">{detail}</Text>
      </View>
      {mode !== "pending" ? (
        <>
          <View style={styles.fields}>
            {kgEditable ? (
              <View style={styles.flex1}>
                <Text variant="label" style={styles.fieldLabel}>
                  kg
                </Text>
                <TextInput
                  accessibilityLabel="Weight in kg"
                  value={load}
                  onChangeText={(text) => setLoad(cleanLoad(text))}
                  onFocus={() => setFocus("load")}
                  onBlur={() => setFocus(null)}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  selectTextOnFocus
                  maxLength={6}
                  placeholderTextColor={theme.colors.ink4}
                  style={[styles.input, focus === "load" ? styles.inputFocus : null]}
                />
              </View>
            ) : null}
            <View style={styles.flex1}>
              <Text variant="label" style={styles.fieldLabel}>
                Reps
              </Text>
              <TextInput
                accessibilityLabel="Reps"
                value={reps}
                onChangeText={(text) => setReps(cleanReps(text))}
                onFocus={() => setFocus("reps")}
                onBlur={() => setFocus(null)}
                keyboardType="number-pad"
                inputMode="numeric"
                selectTextOnFocus
                maxLength={3}
                placeholderTextColor={theme.colors.ink4}
                style={[styles.input, focus === "reps" ? styles.inputFocus : null]}
              />
            </View>
          </View>
          <Text variant="caption">
            {mode === "logged"
              ? `${coach} sees the set as you last saved it.`
              : `${coach} sees it as skipped until you log it.`}
          </Text>
          <View style={styles.actions}>
            <Button
              label={mode === "logged" ? "Save changes" : "Log set"}
              disabled={!repsValid || !loadValid}
              onPress={() => onSave({ load, reps, bodyweight })}
            />
            {mode === "logged" ? (
              <Button label="Mark not done" variant="secondary" onPress={onMarkNotDone} />
            ) : null}
          </View>
        </>
      ) : (
        <View style={styles.actions}>
          <Button label="Skip set" variant="secondary" onPress={onSkip} />
          <Button label="Keep it" variant="text" onPress={onDismiss} />
        </View>
      )}
    </BottomSheet>
  );
}

/* --------------------------------------------------------- finish early */

const RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const RPE_ANCHORS: Record<number, string> = {
  1: "Very easy",
  5: "Hard",
  10: "Max effort",
};

/** W-16: what is not logged, with "Go to" for each exercise. */
export function FinishSheet({
  visible,
  unlogged,
  notLogged,
  total,
  coachFirst,
  requireRpe,
  sessionRpe,
  onPickRpe,
  onGoTo,
  onFinish,
  onDismiss,
}: {
  visible: boolean;
  unlogged: readonly UnloggedExercise[];
  notLogged: number;
  total: number;
  coachFirst: string;
  requireRpe: boolean;
  sessionRpe: number | null;
  onPickRpe: (value: number) => void;
  onGoTo: (row: UnloggedExercise) => void;
  onFinish: () => void;
  onDismiss: () => void;
}) {
  const styles = useStyles();
  const early = notLogged > 0;
  const coach = coachFirst === "your coach" ? "Your coach" : coachFirst;
  return (
    <BottomSheet visible={visible} headerless onDismiss={onDismiss}>
      <View>
        <Text variant="title" accessibilityRole="header">
          {early ? "Finish early?" : "Finish workout?"}
        </Text>
        {early ? (
          <Text variant="subhead" style={styles.topGap}>
            {notLogged} of {total} sets aren’t logged. {coach} will see which sets you did.
          </Text>
        ) : null}
      </View>
      {early ? (
        <View style={styles.group}>
          {unlogged.map((row) => (
            <View key={row.exerciseExecutionId} style={styles.feRow}>
              <View style={styles.flex1}>
                <Text variant="body" style={styles.feName} numberOfLines={1}>
                  {row.name}
                </Text>
                <Text variant="subhead" style={styles.small}>
                  {row.detail}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Go to ${row.name}`}
                onPress={() => onGoTo(row)}
                hitSlop={12}
                style={styles.linkHit}
              >
                <Text style={styles.link}>Go to</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {requireRpe ? (
        <View>
          <Text variant="label" style={styles.fieldLabel}>
            How hard was the session?
          </Text>
          <View style={styles.rpeRow}>
            {RPE_VALUES.map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: sessionRpe === value }}
                accessibilityLabel={`RPE ${value}${RPE_ANCHORS[value] ? ` · ${RPE_ANCHORS[value]}` : ""}`}
                onPress={() => onPickRpe(value)}
                style={[styles.rpeChip, sessionRpe === value ? styles.rpeChipOn : null]}
              >
                <Text
                  style={[
                    styles.rpeText,
                    sessionRpe === value ? styles.rpeTextOn : null,
                  ]}
                >
                  {value}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text variant="caption" style={styles.topGap}>
            1 · Very easy … 10 · Max effort
          </Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button
          label={early ? "Finish anyway" : "Finish workout"}
          disabled={requireRpe && sessionRpe == null}
          onPress={onFinish}
        />
        <Button label="Keep going" variant="secondary" onPress={onDismiss} />
      </View>
    </BottomSheet>
  );
}

/* --------------------------------------------------------------- dialog */

export type DialogAction = {
  label: string;
  variant?: ButtonVariant;
  onPress: () => void;
};

/** Kit `.dialog`: a centred card over the scrim (W-15, W-18). */
export function ConfirmDialog({
  visible,
  icon,
  tone = "brand",
  title,
  body,
  actions,
  onDismiss,
}: {
  visible: boolean;
  icon: ReactNode;
  tone?: "brand" | "crit";
  title: string;
  body: string;
  actions: readonly DialogAction[];
  /** Hardware back and a tap outside. */
  onDismiss: () => void;
}) {
  const styles = useStyles();
  return (
    <Modal
      animationType="fade"
      transparent
      statusBarTranslucent
      visible={visible}
      onRequestClose={onDismiss}
    >
      <View style={styles.dialogRoot} accessibilityViewIsModal>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={styles.dialogScrim}
          onPress={onDismiss}
        />
        <View style={styles.dialog} accessibilityRole="alert">
          <View
            style={[styles.dialogIcon, tone === "crit" ? styles.dialogIconCrit : null]}
          >
            {icon}
          </View>
          <Text variant="headline" style={styles.center} accessibilityRole="header">
            {title}
          </Text>
          <Text variant="subhead" style={[styles.center, styles.dialogBody]}>
            {body}
          </Text>
          <View style={styles.dialogActions}>
            {actions.map((action) => (
              <Button
                key={action.label}
                label={action.label}
                variant={action.variant ?? "primary"}
                onPress={action.onPress}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createThemedStyles((t) => ({
  flex1: { flex: 1, minWidth: 0 },
  center: { textAlign: "center" },
  small: { fontSize: 13 },
  topGap: { marginTop: 4 },
  tile: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 21,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  menuHead: { alignItems: "center", flexDirection: "row", gap: 12 },
  group: {
    backgroundColor: t.colors.bg,
    borderRadius: 16,
    overflow: "hidden",
  },
  menuRow: {
    alignItems: "center",
    borderTopColor: t.colors.line,
    borderTopWidth: 0.5,
    flexDirection: "row",
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  menuIcon: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 9,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  fields: { flexDirection: "row", gap: 10 },
  fieldLabel: { marginBottom: 6 },
  input: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line2,
    borderRadius: 12,
    borderWidth: 1,
    color: t.colors.ink,
    fontSize: 20,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    height: 50,
    paddingHorizontal: 14,
    textAlign: "center",
  },
  inputFocus: { borderColor: t.colors.brand, borderWidth: 2 },
  actions: { gap: 8, marginTop: 4 },
  feRow: {
    alignItems: "center",
    borderTopColor: t.colors.line,
    borderTopWidth: 0.5,
    flexDirection: "row",
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  feName: { fontSize: 15 },
  linkHit: { justifyContent: "center", minHeight: 28 },
  link: { color: t.colors.brand, fontSize: 14, fontWeight: "600" },
  rpeRow: { flexDirection: "row", gap: 4 },
  rpeChip: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 9,
    flex: 1,
    height: t.touchTarget,
    justifyContent: "center",
  },
  rpeChipOn: { backgroundColor: t.colors.brand },
  rpeText: {
    color: t.colors.ink2,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  rpeTextOn: { color: t.colors.onBrand },

  dialogRoot: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 36,
  },
  dialogScrim: {
    backgroundColor: t.colors.scrim,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  dialog: {
    alignSelf: "stretch",
    backgroundColor: t.colors.card,
    borderColor: t.colors.edge,
    borderRadius: 20,
    borderWidth: t.scheme === "dark" ? 1 : 0,
    paddingBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 22,
    shadowColor: shadowColor(t),
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: t.scheme === "dark" ? 0 : 0.3,
    shadowRadius: 50,
  },
  dialogIcon: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    marginBottom: 12,
    width: 44,
  },
  dialogIconCrit: { backgroundColor: t.colors.critTint },
  dialogBody: { marginTop: 6 },
  dialogActions: { gap: 8, marginTop: 16 },
}));
