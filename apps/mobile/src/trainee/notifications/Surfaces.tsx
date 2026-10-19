import { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { brand, ink } from "@fitbud/tokens";
import { fontFamilyBold, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import {
  DEV_BUILD_NOTE,
  MEAL_NOTIFICATION_ACTIONS,
  isMealSnoozed,
  snoozeMeal,
  snoozeNotice,
  type QuietHoursInput,
} from "../../notifications/actions";
import { scheduleMealSnoozeNotification } from "../../notifications/nativeActions";
import { mealPushCopy } from "../../notifications/copy";
import {
  DEMO_LIVE_ACTIVITY,
  currentValueLine,
  formatKg,
  loggedSetLine,
  reduceLiveActivity,
  setLogFromState,
  setProgressLine,
  type LiveActivityEvent,
  type LiveActivityState,
} from "../../notifications/liveActivity";

import appIcon from "../../../../../packages/brand/app/icon.png";

const EXERCISE = "Romanian deadlift";
const WORKOUT = "Lower body B";

function AppIcon({ size }: { size: number }) {
  return (
    <Image
      source={appIcon}
      accessibilityLabel="FitBud"
      style={{
        borderRadius: Math.round(size * 0.22),
        height: size,
        width: size,
      }}
    />
  );
}

export function DevBuildNote() {
  return (
    <Text style={styles.devNote} accessibilityRole="text">
      {DEV_BUILD_NOTE}
    </Text>
  );
}

export function MealInlineButtons({
  mealId,
  title,
  body,
  quiet,
  onOpen,
  onSnoozed,
}: {
  mealId: string;
  title: string;
  body: string;
  quiet?: QuietHoursInput | null;
  onOpen: () => void;
  onSnoozed: (message: string) => void;
}) {
  const [snoozed, setSnoozed] = useState(() => isMealSnoozed(mealId));

  async function snooze() {
    const now = new Date();
    const result = snoozeMeal(mealId, now, quiet);
    if (!result.ok) {
      setSnoozed(true);
      onSnoozed("Already snoozed.");
      return;
    }
    setSnoozed(true);
    await scheduleMealSnoozeNotification({
      title,
      body,
      mealAssignmentId: mealId,
      until: result.until,
    });
    onSnoozed(snoozeNotice(now, result.until));
  }

  return (
    <View style={styles.actionStack}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={MEAL_NOTIFICATION_ACTIONS[0].buttonTitle}
        onPress={onOpen}
        style={styles.actionRow}
      >
        <Text style={styles.actionText}>
          {MEAL_NOTIFICATION_ACTIONS[0].buttonTitle}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={MEAL_NOTIFICATION_ACTIONS[1].buttonTitle}
        accessibilityState={{ disabled: snoozed }}
        disabled={snoozed}
        onPress={() => {
          void snooze();
        }}
        style={[styles.actionRow, snoozed ? styles.actionDisabled : null]}
      >
        <Text style={styles.actionText}>
          {MEAL_NOTIFICATION_ACTIONS[1].buttonTitle}
        </Text>
      </Pressable>
    </View>
  );
}

export function MealNotificationCard({
  mealId,
  mealLabel,
  hideDetails,
  whenLabel = "now",
  quiet,
  onOpen,
  onSnoozed,
}: {
  mealId: string;
  mealLabel: string;
  hideDetails: boolean;
  whenLabel?: string;
  quiet?: QuietHoursInput | null;
  onOpen: () => void;
  onSnoozed: (message: string) => void;
}) {
  const copy = mealPushCopy(mealLabel, hideDetails);

  return (
    <View accessibilityLabel="Meal notification" style={styles.mealCard}>
      <View style={styles.mealTop}>
        <AppIcon size={38} />
        <Text style={styles.noteTitle}>{copy.title}</Text>
        <Text style={styles.when}>{whenLabel}</Text>
      </View>
      <MealInlineButtons
        mealId={mealId}
        title={copy.title}
        body={copy.body}
        quiet={quiet}
        onOpen={onOpen}
        onSnoozed={onSnoozed}
      />
    </View>
  );
}

function useWorkout(onNotice?: (message: string) => void) {
  const [state, setState] = useState<LiveActivityState>(DEMO_LIVE_ACTIVITY);

  function send(event: LiveActivityEvent) {
    setState((current) => {
      if (event.type === "log_set" && !current.finished) {
        const entry = setLogFromState(current, EXERCISE);
        onNotice?.(
          `Set ${entry.setIndex} logged · ${formatKg(entry.kilograms)} kg × ${entry.reps}. The lock screen needs a dev build.`,
        );
      }
      return reduceLiveActivity(current, event);
    });
  }

  function open() {
    onNotice?.("Opens the workout. Typing a value needs the app.");
  }

  return { state, send, open };
}

function Stepper({
  value,
  unit,
  lessLabel,
  moreLabel,
  onLess,
  onMore,
  dark,
}: {
  value: string;
  unit: string;
  lessLabel: string;
  moreLabel: string;
  onLess: () => void;
  onMore: () => void;
  dark?: boolean;
}) {
  return (
    <View style={[styles.stepper, dark ? styles.stepperDark : null]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={lessLabel}
        onPress={onLess}
        style={[styles.stepBtn, dark ? styles.stepBtnDark : null]}
      >
        <Text style={[styles.stepBtnText, dark ? styles.onDark : null]}>−</Text>
      </Pressable>
      <Text style={[styles.stepNumber, dark ? styles.onDark : null]}>
        {value} {unit}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={moreLabel}
        onPress={onMore}
        style={[styles.stepBtn, dark ? styles.stepBtnDark : null]}
      >
        <Text style={[styles.stepBtnText, dark ? styles.onDark : null]}>+</Text>
      </Pressable>
    </View>
  );
}

function LockCard({
  state,
  onLog,
  onOpen,
}: {
  state: LiveActivityState;
  onLog: () => void;
  onOpen: () => void;
}) {
  const logged = loggedSetLine(state);
  return (
    <View style={styles.live} accessibilityLabel="Workout in progress">
      <View style={styles.liveHead}>
        <AppIcon size={22} />
        <Text style={styles.kicker}>FitBud · {WORKOUT}</Text>
        <Text style={styles.whenDark}>now</Text>
      </View>
      <Text style={styles.exercise}>{EXERCISE}</Text>
      <Text style={styles.sub}>{setProgressLine(state)}</Text>
      {logged ? <Text style={styles.logged}>{logged}</Text> : null}
      <View style={styles.valueRow}>
        <Text style={styles.value}>{currentValueLine(state)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open"
          onPress={onOpen}
          style={styles.openBtn}
        >
          <Text style={styles.openText}>Open</Text>
        </Pressable>
        {state.finished ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Log set ${state.setIndex}`}
            onPress={onLog}
            style={styles.check}
          >
            <Text style={styles.checkMark}>✓</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function WorkoutNotificationPreviews({
  onNotice,
}: {
  onNotice?: (message: string) => void;
}) {
  const { state, send, open } = useWorkout(onNotice);
  const logged = loggedSetLine(state);
  const prior =
    logged ??
    `Set ${state.setIndex - 1} logged · ${formatKg(state.lastKg)} kg × ${state.lastReps}`;

  return (
    <View style={styles.stack}>
      <LockCard
        state={state}
        onLog={() => send({ type: "log_set" })}
        onOpen={open}
      />
      <View style={styles.pill} accessibilityLabel="Compact Live Activity">
        <AppIcon size={22} />
        <Text style={styles.pillText}>
          Set {state.setIndex} of {state.setCount}
        </Text>
      </View>
      <View style={styles.live} accessibilityLabel="Expanded Live Activity">
        <View style={styles.liveHead}>
          <AppIcon size={22} />
          <Text style={styles.kicker}>FitBud · {WORKOUT}</Text>
          <Text style={styles.whenDark}>now</Text>
        </View>
        <Text style={styles.exercise}>{EXERCISE}</Text>
        <Text style={styles.sub}>{setProgressLine(state)}</Text>
        {logged ? <Text style={styles.logged}>{logged}</Text> : null}
        {state.finished ? null : (
          <>
            <View style={styles.stepRow}>
              <Stepper
                value={formatKg(state.kilograms)}
                unit="kg"
                lessLabel="Less weight"
                moreLabel="More weight"
                onLess={() => send({ type: "weight", direction: -1 })}
                onMore={() => send({ type: "weight", direction: 1 })}
              />
              <Stepper
                value={String(state.reps)}
                unit="reps"
                lessLabel="Fewer reps"
                moreLabel="More reps"
                onLess={() => send({ type: "reps", direction: -1 })}
                onMore={() => send({ type: "reps", direction: 1 })}
              />
            </View>
            <View style={styles.pair}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open"
                onPress={open}
                style={[styles.pairBtn, styles.pairSecondary]}
              >
                <Text style={styles.openText}>Open</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Log set ${state.setIndex}`}
                onPress={() => send({ type: "log_set" })}
                style={[styles.pairBtn, styles.pairPrimary]}
              >
                <Text style={styles.pairPrimaryText}>✓  Log set {state.setIndex}</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
      <View style={styles.android} accessibilityLabel="Android workout notification">
        <View style={styles.liveHead}>
          <AppIcon size={24} />
          <Text style={styles.androidKicker}>FitBud · Workout · now</Text>
        </View>
        <Text style={styles.androidTitle}>
          {EXERCISE} · Set {state.setIndex} of {state.setCount}
        </Text>
        <Text style={styles.androidSub}>
          Last: {formatKg(state.lastKg)} kg × {state.lastReps}
        </Text>
        {state.finished ? null : (
          <>
            <View style={styles.stepRow}>
              <Stepper
                dark
                value={formatKg(state.kilograms)}
                unit="kg"
                lessLabel="Less weight"
                moreLabel="More weight"
                onLess={() => send({ type: "weight", direction: -1 })}
                onMore={() => send({ type: "weight", direction: 1 })}
              />
              <Stepper
                dark
                value={String(state.reps)}
                unit="reps"
                lessLabel="Fewer reps"
                moreLabel="More reps"
                onLess={() => send({ type: "reps", direction: -1 })}
                onMore={() => send({ type: "reps", direction: 1 })}
              />
            </View>
            <View style={styles.pair}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Log set ${state.setIndex}`}
                onPress={() => send({ type: "log_set" })}
                style={[styles.pairBtn, styles.pairPrimary]}
              >
                <Text style={styles.pairPrimaryText}>✓ Log set {state.setIndex}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open"
                onPress={open}
                style={[styles.pairBtn, styles.androidOpen]}
              >
                <Text style={styles.onDark}>Open</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
      <View style={styles.androidDim}>
        <View style={styles.liveHead}>
          <AppIcon size={24} />
          <Text style={styles.androidKicker}>FitBud · 2 min ago</Text>
        </View>
        <Text style={styles.androidTitle}>{prior}</Text>
      </View>
    </View>
  );
}

export function LockMessageCard({
  title,
  body,
  whenLabel,
}: {
  title: string;
  body: string;
  whenLabel: string;
}) {
  return (
    <View style={styles.noteCard}>
      <AppIcon size={38} />
      <View style={styles.noteBody}>
        <View style={styles.noteTop}>
          <Text style={styles.appName}>FitBud</Text>
          <Text style={styles.when}>{whenLabel}</Text>
        </View>
        <Text style={styles.noteTitle}>{title}</Text>
        {body ? <Text style={styles.noteCopy}>{body}</Text> : null}
      </View>
    </View>
  );
}

export function InAppBanner({
  title,
  openLabel,
  onOpen,
  floating = false,
}: {
  title: string;
  openLabel: string;
  onOpen: () => void;
  floating?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={openLabel}
      onPress={onOpen}
      style={[styles.banner, floating ? styles.bannerFloat : null]}
    >
      <AppIcon size={38} />
      <View style={styles.bannerBody}>
        <Text style={styles.bannerKicker}>FitBud</Text>
        <Text numberOfLines={1} style={styles.bannerTitle}>
          {title}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  devNote: {
    backgroundColor: brand.paleLavender,
    borderColor: "#E4DEFF",
    borderRadius: 16,
    borderWidth: 1,
    color: ink[700],
    fontSize: 14,
    lineHeight: 20,
    padding: 14,
  },
  noteCard: {
    alignItems: "center",
    backgroundColor: "#F2F1F7",
    borderRadius: 20,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  mealCard: {
    backgroundColor: "#F2F1F7",
    borderRadius: 20,
    paddingBottom: 11,
    paddingLeft: 11,
    paddingRight: 14,
    paddingTop: 11,
  },
  mealTop: { alignItems: "center", flexDirection: "row", gap: 10 },
  noteBody: { flex: 1, minWidth: 0 },
  noteTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  appName: {
    color: ink[900],
    fontFamily: fontFamilyBold,
    fontSize: 13,
  },
  when: { color: "#4A4A52", fontSize: 13 },
  whenDark: { color: "#3D3D44", fontSize: 13 },
  noteTitle: {
    color: "#1C1C1E",
    flex: 1,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  noteCopy: {
    color: ink[700],
    fontSize: 15,
    lineHeight: 20,
    marginTop: 2,
  },
  actionStack: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  actionRow: {
    alignItems: "center",
    backgroundColor: "rgba(60,60,67,0.12)",
    borderRadius: 14,
    flex: 1,
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  actionDisabled: { opacity: 0.45 },
  actionText: {
    color: "#000",
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
  },
  live: {
    backgroundColor: "rgba(242,241,247,0.96)",
    borderRadius: 22,
    paddingBottom: 14,
    paddingHorizontal: 14,
    paddingTop: 13,
  },
  liveHead: { alignItems: "center", flexDirection: "row", gap: 8 },
  kicker: {
    color: "#3D3D44",
    flex: 1,
    fontFamily: fontFamilySemiBold,
    fontSize: 13,
  },
  exercise: {
    color: "#000",
    fontFamily: fontFamilyBold,
    fontSize: 18,
    marginTop: 8,
  },
  sub: { color: "#3D3D44", fontSize: 14, marginTop: 1 },
  logged: { color: "#3D3D44", fontSize: 13, marginTop: 8 },
  valueRow: { alignItems: "center", flexDirection: "row", gap: 10, marginTop: 10 },
  value: {
    color: "#000",
    flex: 1,
    fontFamily: fontFamilyBold,
    fontSize: 26,
    letterSpacing: -0.2,
  },
  openBtn: {
    alignItems: "center",
    backgroundColor: "rgba(60,60,67,0.12)",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  openText: { color: "#000", fontFamily: fontFamilyBold, fontSize: 15 },
  check: {
    alignItems: "center",
    backgroundColor: brand.indigo,
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  checkMark: { color: "#fff", fontFamily: fontFamilyBold, fontSize: 26 },
  pill: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#000",
    borderRadius: 20,
    flexDirection: "row",
    height: 36,
    justifyContent: "space-between",
    paddingLeft: 8,
    paddingRight: 14,
    width: 168,
  },
  pillText: { color: "#fff", fontFamily: fontFamilySemiBold, fontSize: 14 },
  stepRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  stepper: {
    alignItems: "center",
    backgroundColor: "rgba(60,60,67,0.08)",
    borderRadius: 14,
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 3,
  },
  stepperDark: { backgroundColor: "#3A3647" },
  stepBtn: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  stepBtnDark: { backgroundColor: "transparent" },
  stepBtnText: { color: "#000", fontFamily: fontFamilySemiBold, fontSize: 22 },
  stepNumber: { color: "#000", fontFamily: fontFamilyBold, fontSize: 20 },
  pair: { flexDirection: "row", gap: 8, marginTop: 10 },
  pairBtn: {
    alignItems: "center",
    borderRadius: 25,
    height: 50,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  pairSecondary: { backgroundColor: "rgba(60,60,67,0.12)", flex: 1 },
  pairPrimary: { backgroundColor: brand.indigo, flex: 2 },
  pairPrimaryText: { color: "#fff", fontFamily: fontFamilyBold, fontSize: 16 },
  android: {
    backgroundColor: "#2B2836",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  androidDim: {
    backgroundColor: "#2B2836",
    borderRadius: 24,
    opacity: 0.72,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  androidKicker: { color: "#D6D2E6", flex: 1, fontSize: 12 },
  androidTitle: {
    color: "#fff",
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
    marginTop: 10,
  },
  androidSub: { color: "#D6D2E6", fontSize: 14, marginTop: 2 },
  androidOpen: { backgroundColor: "#3A3647", flex: 1 },
  onDark: { color: "#fff", fontFamily: fontFamilyBold, fontSize: 16 },
  onDarkMuted: { color: "#D6D2E6", fontSize: 12 },
  banner: {
    alignItems: "center",
    backgroundColor: "rgba(250,249,253,0.97)",
    borderRadius: 20,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    shadowColor: "#1A1248",
    shadowOpacity: 0.24,
    shadowRadius: 14,
  },
  bannerFloat: {
    left: 10,
    position: "absolute",
    right: 10,
    top: 56,
    zIndex: 50,
  },
  bannerBody: { flex: 1, minWidth: 0 },
  bannerKicker: { color: "#4A4A52", fontFamily: fontFamilySemiBold, fontSize: 13 },
  bannerTitle: { color: "#000", fontSize: 14 },
  chevron: {
    color: "#4A4A52",
    fontSize: 22,
    textAlign: "center",
    width: 44,
  },
});
