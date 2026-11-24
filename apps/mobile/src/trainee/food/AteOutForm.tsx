import { useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { ActivityIndicator } from "react-native";
import { userFacingMessage } from "@fitbud/api-client";
import type { LoggedFoodItem, MealAssignment } from "@fitbud/contracts";
import { formatClockTime, formatNumber } from "@fitbud/core";
import { ErrorBanner } from "../../components/ErrorBanner";
import { HeaderBack } from "../../components/HeaderBack";
import { OfflineBanner } from "../../components/OfflineBanner";
import { Text } from "../../components/Text";
import { reportError } from "../../lib/reportError";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import { useSyncEngine } from "../../sync/SyncProvider";
import { useApiReachable } from "../../sync/useSyncStatus";
import { useDeviceOffline } from "../today/queuedLogs";
import { deviateMealAssignment } from "../mealActions";
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

export type CoachDeviateSave = (body: {
  deviationKind: "restaurant" | "portion_adjustment" | "logged_foods";
  notes: string | null;
  items: LoggedFoodItem[];
}) => Promise<void>;

type Props = {
  assignment: MealAssignment;
  relationshipId: string;
  coachName: string;
  timeZone: string;
  onCancel: () => void;
  onSaved: () => void;
  style?: StyleProp<ViewStyle>;
  /**
   * Z12-52 coach-author mode: save via the trainer PUT instead of the
   * trainee sync deviate, and soften the "Note for {coach}" copy.
   */
  authorMode?: "trainee" | "coach";
  /** Client first name when authorMode is coach (plan / note copy). */
  clientName?: string;
  onCoachSave?: CoachDeviateSave;
  /**
   * `inline` (default) keeps the form inside its caller's own scroll view and
   * header (search with no match, TR-26d). `screen` is the full screen of
   * TR-08c2/TR-08c3 with Save pinned above the keyboard.
   */
  layout?: "inline" | "screen";
  /** With `layout="screen"`: the screen sits in a Modal. */
  inModal?: boolean;
};


/** True when the phone has no way to reach the server: a save then waits in the outbox. */
export function useSavesWaiting(): boolean {
  const deviceOffline = useDeviceOffline();
  const reachable = useApiReachable();
  return deviceOffline || reachable === false;
}

/** The neutral offline line above a save (TR-08b3 / D-W14-9); nothing while online. */
export function OfflineSaveBanner() {
  const waiting = useSavesWaiting();
  return waiting ? <OfflineBanner message={OFFLINE_SAVE_COPY} /> : null;
}

/** TR-08b3 / D-W14-9: the neutral line a save made offline shows. */
export const OFFLINE_SAVE_COPY =
  "You\u2019re offline. Your change saves on your phone and sends when you\u2019re back.";

type SubScreenProps = {
  title: string;
  subtitle: string;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
  /** Shown under the header (the offline line). */
  banner?: ReactNode;
  /** Pinned under the scroll area and kept above the keyboard (Save, totals). */
  footer?: ReactNode;
  /** Set when the screen sits in a Modal: Android then needs its own keyboard lift. */
  inModal?: boolean;
  testID?: string;
  children: ReactNode;
};

/**
 * The shared full screen for "Changed the portion" and "Ate out" (TR-08b2,
 * TR-08c2, TR-08c3): back top left, a two-line title, Save top right, one
 * scroll container, and a footer that stays above the keyboard on iOS and
 * Android (Z14-13). Nothing in here scrolls inside another scroll view.
 */
export function MealSubScreen({
  title,
  subtitle,
  onBack,
  onSave,
  saving,
  banner,
  footer,
  inModal = false,
  testID,
  children,
}: SubScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <SafeAreaView style={styles.frame} testID={testID}>
      <KeyboardAvoidingView
        style={styles.frameFill}
        behavior={
          Platform.OS === "ios" ? "padding" : inModal ? "height" : undefined
        }
      >
        <View style={styles.bar}>
          <View style={styles.barSide}>
            <HeaderBack onPress={onBack} label="Back" />
          </View>
          <View style={styles.barCenter}>
            <Text variant="headline" numberOfLines={1} style={styles.centerText}>
              {title}
            </Text>
            <Text variant="caption" tone="ink2" numberOfLines={1} style={styles.centerText}>
              {subtitle}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save"
            accessibilityState={{ disabled: saving, busy: saving }}
            disabled={saving}
            onPress={onSave}
            style={[styles.barSide, styles.barRight]}
          >
            {saving ? (
              <ActivityIndicator color={theme.colors.ink} />
            ) : (
              <Text variant="bodyStrong">Save</Text>
            )}
          </Pressable>
        </View>
        {banner ? <View style={styles.banner}>{banner}</View> : null}
        <ScrollView
          style={styles.frameFill}
          contentContainerStyle={styles.scrollBody}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** The pinned primary button of a meal sub-screen. */
export function SubScreenSaveButton({
  label,
  onPress,
  saving,
  testID,
}: {
  label: string;
  onPress: () => void;
  saving: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: saving, busy: saving }}
      disabled={saving}
      onPress={onPress}
      style={[styles.primary, saving ? styles.busy : null]}
      testID={testID}
    >
      {saving ? (
        <ActivityIndicator color={theme.colors.onBrand} />
      ) : (
        <Text variant="bodyStrong" tone="onBrand">
          {label}
        </Text>
      )}
    </Pressable>
  );
}

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
  authorMode = "trainee",
  onCoachSave,
  layout = "inline",
  inModal = false,
}: Props) {
  const styles = useStyles();
  const theme = useTheme();
  const sync = useSyncEngine();
  const coachShort = coachName.split(/\s+/)[0] ?? coachName;
  const isCoach = authorMode === "coach";
  const [kcalText, setKcalText] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const planKcal = nutrientsFromMealPrescription(assignment).kcal;
  const kcal = parseKcal(kcalText);
  const mealName = cleanFoodLabel(assignment.mealName);

  async function save() {
    if (kcal == null && !note.trim()) {
      setError(
        isCoach
          ? "Enter the kcal, or a short note about what they had."
          : "Enter the kcal, or a short note about what you had.",
      );
      return;
    }
    setSaving(true);
    setError(null);
    const body = ateOutBody(kcal, note);
    try {
      if (isCoach) {
        if (!onCoachSave) throw new Error("Coach save is not wired.");
        await onCoachSave({
          deviationKind: "restaurant",
          notes: body.notes,
          items: body.items,
        });
      } else {
        await deviateMealAssignment(sync, assignment, body, coachName, relationshipId);
        announceMealSaved({
          relationshipId,
          assignmentId: assignment.id,
          localDate: assignment.localDate,
          mealName,
          kcal,
          kind: "restaurant",
        });
      }
      onSaved();
    } catch (err) {
      reportError("AteOutForm.save", err);
      setError(
        userFacingMessage(err, { fallback: "Couldn’t save that meal. Try again." }),
      );
    } finally {
      setSaving(false);
    }
  }

  const fields = (
    <>
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
            {isCoach
              ? `Plan for ${mealName.toLowerCase()}: ${formatNumber(planKcal)} kcal`
              : `${coachShort}’s plan for ${mealName.toLowerCase()}: ${formatNumber(planKcal)} kcal`}
          </Text>
        ) : null}
        <Text variant="bodyStrong" style={styles.noteLabel}>
          {isCoach ? "Note (optional)" : `Note for ${coachShort} (optional)`}
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={isCoach ? "Where, and what they had" : "Where, and what you had"}
          placeholderTextColor={theme.colors.ink4}
          accessibilityLabel={isCoach ? "Note" : `Note for ${coachShort}`}
          maxLength={500}
          style={styles.noteInput}
          testID="ate-out-note"
        />
        {error ? <ErrorBanner message={error} /> : null}
    </>
  );
  const subtitle = `${mealName} \u00b7 ${formatClockTime(assignment.windowStartsAt, timeZone)}`;

  if (layout === "screen") {
    const saveLabel =
      kcal != null ? `Save \u00b7 ${formatNumber(kcal)} kcal` : note.trim() ? "Save note" : "Save";
    return (
      <MealSubScreen
        testID="ate-out-form"
        title="Ate out"
        subtitle={subtitle}
        onBack={onCancel}
        onSave={() => void save()}
        saving={saving}
        inModal={inModal}
        banner={isCoach ? null : <OfflineSaveBanner />}
        footer={
          <SubScreenSaveButton
            label={saveLabel}
            onPress={() => void save()}
            saving={saving}
            testID="ate-out-save"
          />
        }
      >
        {fields}
      </MealSubScreen>
    );
  }

  return (
    <View style={[styles.root, style]} testID="ate-out-form">
      <FoodNavHeader
        title="Ate out"
        subtitle={subtitle}
        onLeft={onCancel}
        rightLabel="Save"
        onRight={() => void save()}
        busy={saving}
      />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {fields}
      </ScrollView>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  root: { backgroundColor: t.colors.bgPlain, flex: 1 },
  frame: { backgroundColor: t.colors.bgPlain, flex: 1 },
  frameFill: { flex: 1 },
  bar: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 56,
    paddingHorizontal: 8,
  },
  barSide: { alignItems: "flex-start", justifyContent: "center", minHeight: t.touchTarget, minWidth: 72 },
  barRight: { alignItems: "flex-end", paddingRight: 8 },
  barCenter: { alignItems: "center", flex: 1, minWidth: 0 },
  centerText: { textAlign: "center" },
  banner: { paddingBottom: 8, paddingHorizontal: 16 },
  scrollBody: { gap: 12, paddingBottom: 24, paddingHorizontal: 20, paddingTop: 4 },
  footer: {
    backgroundColor: t.colors.bgPlain,
    gap: 10,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  primary: {
    alignItems: "center",
    backgroundColor: t.colors.brand,
    borderRadius: t.radii.button,
    justifyContent: "center",
    minHeight: 52,
  },
  busy: { opacity: 0.6 },
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
