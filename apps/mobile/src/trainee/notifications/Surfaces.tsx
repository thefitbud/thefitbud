import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { brand, ink } from "@fitbud/tokens";
import {
  fontFamilyBold,
  fontFamilySemiBold,
} from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import {
  DEV_BUILD_NOTE,
  IN_APP_MEAL_ACTIONS,
  IN_APP_NOTE_ACTIONS,
  LIVE_ACTIVITY_ACTIONS,
  MEAL_NOTIFICATION_ACTIONS,
  isMealSnoozed,
  snoozeMeal,
} from "../../notifications/actions";
import { scheduleMealSnoozeNotification } from "../../notifications/nativeActions";
import { mealPushCopy } from "../../notifications/copy";
import {
  DEMO_LIVE_ACTIVITY,
  formatKg,
  reduceLiveActivity,
  setLogFromState,
  type LiveActivityState,
} from "../../notifications/liveActivity";

import appIcon from "../../../../../packages/brand/app/icon.png";

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
  onOpen,
  onSnoozed,
}: {
  mealId: string;
  title: string;
  body: string;
  onOpen: () => void;
  onSnoozed: (message: string) => void;
}) {
  const [snoozed, setSnoozed] = useState(() => isMealSnoozed(mealId));

  async function snooze() {
    const result = snoozeMeal(mealId);
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
    });
    onSnoozed("Snoozed for 30 minutes.");
  }

  return (
    <View style={styles.inlineActions}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={MEAL_NOTIFICATION_ACTIONS[0].buttonTitle}
        onPress={onOpen}
        style={[styles.inlineBtn, styles.inlinePrimary]}
      >
        <Text style={styles.inlinePrimaryText}>
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
        style={[
          styles.inlineBtn,
          styles.inlineSecondary,
          snoozed ? styles.inlineDisabled : null,
        ]}
      >
        <Text style={styles.inlineSecondaryText}>
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
  onOpen,
  onSnoozed,
}: {
  mealId: string;
  mealLabel: string;
  hideDetails: boolean;
  whenLabel?: string;
  onOpen: () => void;
  onSnoozed: (message: string) => void;
}) {
  const copy = mealPushCopy(mealLabel, hideDetails);

  return (
    <View style={styles.noteCard} accessibilityLabel="Meal notification">
      <AppIcon size={38} />
      <View style={styles.noteBody}>
        <View style={styles.noteTop}>
          <Text style={styles.appName}>FitBud</Text>
          <Text style={styles.when}>{whenLabel}</Text>
        </View>
        <Text style={styles.noteTitle}>{copy.title}</Text>
        <Text style={styles.noteCopy}>{copy.body}</Text>
        <MealInlineButtons
          mealId={mealId}
          title={copy.title}
          body={copy.body}
          onOpen={onOpen}
          onSnoozed={onSnoozed}
        />
      </View>
    </View>
  );
}

function useLiveActivity(onNotice?: (message: string) => void) {
  const [state, setState] = useState<LiveActivityState>(DEMO_LIVE_ACTIVITY);

  useEffect(() => {
    if (state.phase !== "rest") return;
    const timer = setInterval(() => {
      setState((current) => reduceLiveActivity(current, { type: "tick" }));
    }, 1000);
    return () => clearInterval(timer);
  }, [state.phase]);

  function send(event: Parameters<typeof reduceLiveActivity>[1]) {
    setState((current) => {
      const next = reduceLiveActivity(current, event);
      if (event.type === "log_set" && next.phase === "rest") {
        const entry = setLogFromState(current, "Romanian deadlift");
        onNotice?.(
          `Set ${entry.setIndex} logged · ${formatKg(entry.kilograms)} kg × ${entry.reps}. The lock screen needs a dev build.`,
        );
      }
      return next;
    });
  }

  return { state, send };
}

function Stepper({
  label,
  value,
  lessLabel,
  moreLabel,
  onLess,
  onMore,
}: {
  label: string;
  value: string;
  lessLabel: string;
  moreLabel: string;
  onLess: () => void;
  onMore: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={lessLabel}
        onPress={onLess}
        style={styles.stepBtn}
      >
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <View style={styles.stepValue}>
        <Text style={styles.stepLabel}>{label}</Text>
        <Text style={styles.stepNumber}>{value}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={moreLabel}
        onPress={onMore}
        style={styles.stepBtn}
      >
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

export function LiveActivityPreview({
  onNotice,
}: {
  onNotice?: (message: string) => void;
}) {
  const { state, send } = useLiveActivity(onNotice);
  const widthPct = Math.max(8, Math.round((state.restLeft / 90) * 100));
  const logging = state.phase === "logging";

  return (
    <View
      style={styles.live}
      accessibilityLabel={logging ? "Workout in progress" : "Resting"}
    >
      <View style={styles.liveHead}>
        <AppIcon size={22} />
        <Text style={[styles.liveKicker, styles.liveTitle]}>
          Lower body B · exercise 2 of 6
        </Text>
        <Text style={styles.liveKicker}>{logging ? "7 min" : "8 min"}</Text>
      </View>
      {logging ? (
        <>
          <Text style={styles.exercise}>Romanian deadlift</Text>
          <Text style={styles.setLine}>Set 2 of 3 · Prev 20 kg × 10</Text>
          <View style={styles.stepRow}>
            <Stepper
              label="Weight"
              value={`${formatKg(state.kilograms)} kg`}
              lessLabel="Less weight"
              moreLabel="More weight"
              onLess={() => send({ type: "weight", direction: -1 })}
              onMore={() => send({ type: "weight", direction: 1 })}
            />
            <Stepper
              label="Reps"
              value={String(state.reps)}
              lessLabel="Fewer reps"
              moreLabel="More reps"
              onLess={() => send({ type: "reps", direction: -1 })}
              onMore={() => send({ type: "reps", direction: 1 })}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Log set ${state.setIndex}`}
            onPress={() => send({ type: "log_set" })}
            style={styles.logSet}
          >
            <Text style={styles.logSetText}>Log set {state.setIndex}</Text>
          </Pressable>
          <Text style={styles.nextLineCenter}>
            Then 58 s rest · set 3 · 22.5 kg × 10
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Adjust in app"
            onPress={() =>
              onNotice?.("Open the active workout to type a value.")
            }
            style={styles.adjustLink}
          >
            <Text style={styles.adjustText}>Adjust in app</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.liveRow}>
            <View style={styles.liveCopy}>
              <Text style={styles.exercise}>Romanian deadlift</Text>
              <Text style={styles.setLine}>
                {state.phase === "go"
                  ? "Set 3 · Go"
                  : `Set ${state.setIndex} logged · ${formatKg(state.kilograms)} kg × ${state.reps}`}
              </Text>
            </View>
            <View style={styles.restCol}>
              <Text style={styles.restLabel}>
                {state.phase === "go" ? "Next" : "Rest left"}
              </Text>
              <Text style={styles.restValue}>
                {state.phase === "go" ? "Go" : `${state.restLeft} s`}
              </Text>
            </View>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${widthPct}%` }]} />
          </View>
          {state.phase === "rest" ? (
            <View style={styles.liveActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={LIVE_ACTIVITY_ACTIONS[0]}
                onPress={() => send({ type: "add_rest" })}
                style={styles.liveBtn}
              >
                <Text style={styles.liveBtnText}>{LIVE_ACTIVITY_ACTIONS[0]}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={LIVE_ACTIVITY_ACTIONS[1]}
                onPress={() => send({ type: "skip_rest" })}
                style={[styles.liveBtn, styles.liveBtnPrimary]}
              >
                <Text style={styles.liveBtnText}>{LIVE_ACTIVITY_ACTIONS[1]}</Text>
              </Pressable>
            </View>
          ) : null}
          <Text style={styles.nextLine}>Next: set 3 of 3 · 22.5 kg × 10</Text>
          <Text style={styles.adjustText}>After set 3: Step-ups · 3 sets · 14 kg</Text>
        </>
      )}
    </View>
  );
}

export function DynamicIslandPreview({
  onNotice,
}: {
  onNotice?: (message: string) => void;
}) {
  const { state, send } = useLiveActivity(onNotice);
  const logging = state.phase === "logging";

  return (
    <View accessibilityLabel="Expanded Live Activity">
      <View style={styles.island}>
        <View style={styles.liveHead}>
          <AppIcon size={22} />
          <Text style={[styles.liveKicker, styles.liveTitle]}>
            Lower body B · exercise 2 of 6
          </Text>
          <Text style={styles.liveKicker}>{logging ? "7 min" : "8 min"}</Text>
        </View>
        {logging ? (
          <>
            <Text style={styles.islandExercise}>Romanian deadlift</Text>
            <Text style={styles.islandSet}>
              Set 2 of 3 · {formatKg(state.kilograms)} kg × {state.reps}
            </Text>
            <View style={styles.liveActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Adjust in app"
                onPress={() =>
                  onNotice?.("Open the active workout to type a value.")
                }
                style={[styles.liveBtn, styles.islandBtn]}
              >
                <Text style={styles.liveBtnText}>Adjust in app</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Log set"
                onPress={() => send({ type: "log_set" })}
                style={[styles.liveBtn, styles.liveBtnPrimary]}
              >
                <Text style={styles.liveBtnText}>Log set</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={styles.islandRow}>
              <View style={styles.liveCopy}>
                <Text style={styles.islandExercise}>Romanian deadlift</Text>
                <Text style={styles.islandSet}>
                  {state.phase === "go"
                    ? "Set 3 · Go"
                    : `Set ${state.setIndex} logged · ${formatKg(state.kilograms)} kg × ${state.reps}`}
                </Text>
              </View>
              <Text style={styles.islandTime}>
                {state.phase === "go" ? "Go" : `${state.restLeft} s`}
              </Text>
            </View>
            {state.phase === "rest" ? (
              <View style={styles.liveActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={LIVE_ACTIVITY_ACTIONS[0]}
                  onPress={() => send({ type: "add_rest" })}
                  style={[styles.liveBtn, styles.islandBtn]}
                >
                  <Text style={styles.liveBtnText}>{LIVE_ACTIVITY_ACTIONS[0]}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={LIVE_ACTIVITY_ACTIONS[1]}
                  onPress={() => send({ type: "skip_rest" })}
                  style={[styles.liveBtn, styles.liveBtnPrimary]}
                >
                  <Text style={styles.liveBtnText}>{LIVE_ACTIVITY_ACTIONS[1]}</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </View>
      <View style={styles.compactWrap}>
        <Text style={styles.compactLabel}>Compact</Text>
        <View style={styles.compact}>
          <AppIcon size={22} />
          <Text style={styles.compactTime}>
            {state.phase === "logging"
              ? `Set ${state.setIndex}`
              : state.phase === "go"
                ? "Go"
                : `${state.restLeft} s`}
          </Text>
        </View>
        <Text style={styles.compactHint}>
          Compact shows the set, and during rest it shows the countdown.
          Long-press expands it. After Log set it switches to Rest left 58 s
          with +30 s and Skip.
        </Text>
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
        <Text style={styles.noteCopy}>{body}</Text>
      </View>
    </View>
  );
}

export function InAppBanner({
  kicker,
  title,
  body,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  floating = false,
}: {
  kicker: string;
  title: string;
  body: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
  floating?: boolean;
}) {
  return (
    <View
      accessibilityRole="summary"
      style={[styles.banner, floating ? styles.bannerFloat : null]}
    >
      <AppIcon size={38} />
      <View style={styles.bannerBody}>
        <View style={styles.noteTop}>
          <Text style={styles.bannerKicker}>{kicker}</Text>
          <Text style={styles.when}>now</Text>
        </View>
        <Text style={styles.noteTitle}>{title}</Text>
        <Text style={styles.bannerCopy}>{body}</Text>
        <View style={styles.inlineActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            onPress={onPrimary}
            style={[styles.inlineBtn, styles.inlinePrimary]}
          >
            <Text style={styles.inlinePrimaryText}>{primaryLabel}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={secondaryLabel}
            onPress={onSecondary}
            style={[styles.inlineBtn, styles.inlineSecondary]}
          >
            <Text style={styles.inlineSecondaryText}>{secondaryLabel}</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.grabber} />
    </View>
  );
}

export { IN_APP_MEAL_ACTIONS, IN_APP_NOTE_ACTIONS };

const styles = StyleSheet.create({
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
    backgroundColor: "#EEEDF4",
    borderRadius: 22,
    flexDirection: "row",
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  mark: {
    alignItems: "center",
    backgroundColor: brand.indigo,
    borderRadius: 10,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  markText: {
    color: "#fff",
    fontFamily: fontFamilyBold,
    fontSize: 17,
  },
  markSm: {
    alignItems: "center",
    backgroundColor: brand.indigo,
    borderRadius: 6,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  markSmText: {
    color: "#fff",
    fontFamily: fontFamilyBold,
    fontSize: 12,
  },
  noteBody: { flex: 1, minWidth: 0 },
  noteTop: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  appName: {
    color: ink[900],
    fontFamily: fontFamilyBold,
    fontSize: 13,
  },
  when: { color: ink[500], fontSize: 13 },
  noteTitle: {
    color: ink[900],
    fontFamily: fontFamilyBold,
    fontSize: 15,
    lineHeight: 20,
    marginTop: 2,
  },
  noteCopy: {
    color: ink[700],
    fontSize: 15,
    lineHeight: 20,
    marginTop: 2,
  },
  inlineActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  inlineBtn: {
    alignItems: "center",
    borderRadius: 22,
    flex: 1,
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  inlinePrimary: { backgroundColor: brand.indigo },
  inlineSecondary: { backgroundColor: brand.paleLavender },
  inlineDisabled: { opacity: 0.45 },
  inlinePrimaryText: {
    color: "#fff",
    fontFamily: fontFamilyBold,
    fontSize: 15,
  },
  inlineSecondaryText: {
    color: brand.indigo,
    fontFamily: fontFamilyBold,
    fontSize: 15,
  },
  live: {
    backgroundColor: "rgba(20,16,44,0.92)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
  },
  liveHead: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  liveKicker: {
    color: "#fff",
    fontFamily: fontFamilySemiBold,
    fontSize: 13,
  },
  liveTitle: { flex: 1 },
  liveRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  liveCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
  exercise: {
    color: "#fff",
    fontFamily: fontFamilyBold,
    fontSize: 20,
    lineHeight: 24,
  },
  setLine: { color: "#fff", fontSize: 15, marginTop: 3 },
  restCol: { alignItems: "flex-end" },
  restLabel: {
    color: "#fff",
    fontFamily: fontFamilySemiBold,
    fontSize: 13,
  },
  restValue: {
    color: "#CFC6FF",
    fontFamily: fontFamilyBold,
    fontSize: 36,
    letterSpacing: -0.5,
  },
  barTrack: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 3,
    height: 6,
    marginTop: 12,
    overflow: "hidden",
  },
  barFill: {
    backgroundColor: "#B7A9F5",
    borderRadius: 3,
    height: 6,
  },
  nextLine: { color: "#fff", fontSize: 13, marginTop: 10 },
  liveActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  liveBtn: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 22,
    flex: 1,
    height: 44,
    justifyContent: "center",
  },
  liveBtnPrimary: { backgroundColor: brand.indigo },
  islandBtn: { backgroundColor: "#2A2640" },
  liveBtnText: {
    color: "#fff",
    fontFamily: fontFamilyBold,
    fontSize: 15,
  },
  stepRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  stepper: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 4,
  },
  stepBtn: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 12,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  stepBtnText: {
    color: "#fff",
    fontFamily: fontFamilyBold,
    fontSize: 24,
  },
  stepValue: { alignItems: "center", flex: 1 },
  stepLabel: {
    color: "#CFC6FF",
    fontFamily: fontFamilySemiBold,
    fontSize: 11,
  },
  stepNumber: {
    color: "#fff",
    fontFamily: fontFamilyBold,
    fontSize: 18,
  },
  logSet: {
    alignItems: "center",
    backgroundColor: brand.indigo,
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    marginTop: 10,
  },
  logSetText: {
    color: "#fff",
    fontFamily: fontFamilyBold,
    fontSize: 18,
  },
  nextLineCenter: {
    color: "#fff",
    fontSize: 13,
    marginTop: 10,
    textAlign: "center",
  },
  adjustLink: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
  },
  adjustText: {
    color: "#CFC6FF",
    fontFamily: fontFamilySemiBold,
    fontSize: 14,
    marginTop: 2,
    textAlign: "center",
  },
  island: {
    backgroundColor: "#000",
    borderRadius: 44,
    paddingHorizontal: 22,
    paddingVertical: 18,
  },
  islandRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  islandExercise: {
    color: "#fff",
    fontFamily: fontFamilyBold,
    fontSize: 17,
  },
  islandSet: { color: "#E6E3F5", fontSize: 14, marginTop: 2 },
  islandTime: {
    color: "#CFC6FF",
    fontFamily: fontFamilyBold,
    fontSize: 34,
  },
  compactWrap: { marginTop: 12 },
  compactLabel: {
    color: ink[500],
    fontFamily: fontFamilyBold,
    fontSize: 13,
    marginBottom: 10,
  },
  compact: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#000",
    borderRadius: 20,
    flexDirection: "row",
    height: 36,
    justifyContent: "space-between",
    paddingLeft: 8,
    paddingRight: 12,
    width: 220,
  },
  compactTime: {
    color: "#CFC6FF",
    fontFamily: fontFamilyBold,
    fontSize: 15,
  },
  compactHint: {
    color: ink[700],
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  banner: {
    backgroundColor: "#fff",
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
    paddingBottom: 18,
    shadowColor: "#1A1248",
    shadowOpacity: 0.16,
    shadowRadius: 16,
  },
  bannerFloat: {
    left: 10,
    position: "absolute",
    right: 10,
    top: 54,
    zIndex: 50,
  },
  bannerBody: { flex: 1, minWidth: 0 },
  bannerKicker: { color: ink[500], fontSize: 13 },
  bannerCopy: {
    color: ink[700],
    fontSize: 14,
    lineHeight: 19,
    marginTop: 2,
  },
  grabber: {
    backgroundColor: ink[200],
    borderRadius: 2,
    bottom: 6,
    height: 4,
    left: "50%",
    marginLeft: -18,
    position: "absolute",
    width: 36,
  },
});
