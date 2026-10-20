import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { Check, Lock } from "lucide-react-native";
import { Text } from "../../components/Text";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import {
  currentValueLine,
  DEMO_LIVE_ACTIVITY,
  loggedSetLine,
  reduceLiveActivity,
  setProgressLine,
} from "../../notifications/liveActivity";

type FrameProps = {
  dateLabel: string;
  clock: string;
  banner?: string;
  children: React.ReactNode;
};

export function LockFrame({ dateLabel, clock, banner, children }: FrameProps) {
  return (
    <View
      style={[styles.frame, webGradient]}
      accessibilityLabel="Lock screen"
    >
      <View style={styles.glow} />
      <View style={styles.top}>
        {banner ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>Open {clock}</Text>
            <Text style={styles.bannerText}>{banner}</Text>
          </View>
        ) : null}
        <Lock color="#ffffff" size={16} />
        <Text style={styles.date}>{dateLabel}</Text>
        <Text style={styles.clock}>{clock}</Text>
      </View>
      <View style={styles.stack}>{children}</View>
    </View>
  );
}

export function LiveActivityCard({ logged }: { logged: boolean }) {
  const state = logged
    ? reduceLiveActivity(DEMO_LIVE_ACTIVITY, { type: "log_set" })
    : DEMO_LIVE_ACTIVITY;
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.app}>FitBud · Lower body B</Text>
        <Text style={styles.when}>now</Text>
      </View>
      <Text style={styles.exercise}>Romanian deadlift</Text>
      <Text style={styles.progress}>{setProgressLine(state)}</Text>
      {loggedSetLine(state) ? (
        <Text style={styles.logged}>{loggedSetLine(state)}</Text>
      ) : null}
      <View style={styles.row}>
        <Text style={styles.big}>{currentValueLine(state)}</Text>
        <View style={styles.actions}>
          <View style={styles.open}>
            <Text style={styles.openText}>Open</Text>
          </View>
          <View style={styles.check}>
            <Check color="#fff" size={22} strokeWidth={3} />
          </View>
        </View>
      </View>
    </View>
  );
}

export function MealLockCard({
  onOpen,
  onSnooze,
}: {
  onOpen: () => void;
  onSnooze: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.app}>Lunch isn't logged yet</Text>
        <Text style={styles.when}>now</Text>
      </View>
      <View style={styles.mealActions}>
        <Pressable accessibilityRole="button" onPress={onOpen} style={styles.mealBtn}>
          <Text style={styles.mealBtnText}>Open</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onSnooze} style={styles.mealBtn}>
          <Text style={styles.mealBtnText}>Snooze 30 min</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function CoachLockCard({
  title,
  when,
}: {
  title: string;
  when: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.app}>{title}</Text>
        <Text style={styles.when}>{when}</Text>
      </View>
    </View>
  );
}

const webGradient = {
  backgroundImage:
    "linear-gradient(165deg, #1A1248 0%, #3A1D9A 42%, #24145F 100%)",
} as unknown as ViewStyle;

const styles = StyleSheet.create({
  frame: {
    aspectRatio: 393 / 852,
    backgroundColor: "#24145F",
    borderRadius: 28,
    justifyContent: "space-between",
    overflow: "hidden",
    paddingBottom: 28,
    width: "100%",
  },
  glow: {
    backgroundColor: "#F2A3A3",
    borderRadius: 80,
    height: 120,
    opacity: 0.45,
    position: "absolute",
    right: -30,
    top: -20,
    width: 120,
  },
  top: { alignItems: "center", gap: 4, paddingTop: 54 },
  banner: {
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 16,
    marginBottom: 8,
    marginHorizontal: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerText: { color: "#1A1248", fontFamily: fontFamilySemiBold, fontSize: 15 },
  date: {
    color: "#fff",
    fontFamily: fontFamilySemiBold,
    fontSize: 20,
    textAlign: "center",
  },
  clock: {
    color: "#fff",
    fontFamily: fontFamilySemiBold,
    fontSize: 84,
    letterSpacing: -2,
    textAlign: "center",
  },
  stack: { gap: 8, paddingHorizontal: 12 },
  card: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 22,
    padding: 14,
  },
  cardTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  app: { color: "#1A1248", fontFamily: fontFamilySemiBold, fontSize: 15 },
  when: { color: "#6B7280", fontSize: 13 },
  exercise: {
    color: "#1A1248",
    fontFamily: fontFamilySemiBold,
    fontSize: 20,
    marginTop: 8,
  },
  progress: { color: "#4B5563", fontSize: 14, marginTop: 2 },
  logged: { color: "#4527C6", fontSize: 14, marginTop: 4 },
  row: { alignItems: "center", flexDirection: "row", marginTop: 8 },
  big: {
    color: "#1A1248",
    flex: 1,
    fontFamily: fontFamilySemiBold,
    fontSize: 28,
  },
  actions: { alignItems: "center", flexDirection: "row", gap: 8 },
  open: {
    alignItems: "center",
    backgroundColor: "#E7E5F2",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  openText: { color: "#1A1248", fontFamily: fontFamilySemiBold, fontSize: 16 },
  check: {
    alignItems: "center",
    backgroundColor: "#4527C6",
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  mealActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  mealBtn: {
    alignItems: "center",
    backgroundColor: "#E7E5F2",
    borderRadius: 14,
    flex: 1,
    height: 44,
    justifyContent: "center",
  },
  mealBtnText: { color: "#1A1248", fontFamily: fontFamilySemiBold, fontSize: 16 },
});
