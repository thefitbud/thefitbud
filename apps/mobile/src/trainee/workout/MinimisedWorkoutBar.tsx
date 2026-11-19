/**
 * The minimised workout bar (W-14): the open session above the tab bar while
 * the trainee is on another screen. It reads the session store, so it shows
 * the same clock and the same next set as the log it stands for.
 */
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronUp } from "lucide-react-native";
import { Text } from "../../components/Text";
import {
  ThemeScope,
  createThemedStyles,
  shadowColor,
  useTheme,
} from "../../providers/ThemeProvider";
import { elapsedSeconds, formatElapsedClock } from "../workoutDuration";
import { minimisedLine } from "../workoutSession";
import { useActiveSession } from "./activeSession";

/** The bar itself, given what to show. */
export function MinimisedWorkoutBarView({
  title,
  clock,
  line,
  paused,
  onResume,
}: {
  title: string;
  clock: string;
  line: string;
  paused: boolean;
  onResume: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${paused ? "paused at" : "in progress,"} ${clock}. ${line}. Resume`}
      onPress={onResume}
      style={styles.bar}
    >
      <View style={styles.up}>
        <ChevronUp color={theme.colors.ink} size={18} strokeWidth={2.2} />
      </View>
      <View style={styles.flex1}>
        <View style={styles.titleRow}>
          <Text variant="bodyStrong" style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text variant="numberSm" tone={paused ? "warn" : "brand"}>
            {clock}
          </Text>
        </View>
        <Text variant="caption" numberOfLines={1}>
          {line}
        </Text>
      </View>
      <View style={styles.pill}>
        <Text style={styles.pillText}>Resume</Text>
      </View>
    </Pressable>
  );
}

/**
 * The bar for the open session of `relationshipId`; nothing when there is no
 * session or it is on screen. `onResume` brings the log back: the shell
 * switches to the Workout tab and clears `minimised`.
 */
export function MinimisedWorkoutBar({
  relationshipId,
  onResume,
}: {
  relationshipId: string | null;
  onResume: () => void;
}) {
  const session = useActiveSession(relationshipId);
  const visible = session != null && session.minimised;
  const running = visible && session.execution.status !== "paused";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  if (!visible) return null;
  return (
    <ThemeScope scheme="system" drivesSystemBars={false}>
      <MinimisedWorkoutBarView
        title={session.assignment?.workoutDayName ?? "Workout"}
        clock={formatElapsedClock(elapsedSeconds(session.execution, now))}
        line={minimisedLine(session.execution)}
        paused={session.execution.status === "paused"}
        onResume={onResume}
      />
    </ThemeScope>
  );
}

const useStyles = createThemedStyles((t) => ({
  flex1: { flex: 1, minWidth: 0 },
  bar: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.edge,
    borderRadius: 18,
    borderWidth: t.scheme === "dark" ? 1 : 0.5,
    flexDirection: "row",
    gap: 10,
    height: 56,
    paddingLeft: 10,
    paddingRight: 8,
    shadowColor: shadowColor(t),
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: t.scheme === "dark" ? 0 : 0.16,
    shadowRadius: 24,
  },
  up: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  titleRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  title: { flexShrink: 1, fontSize: 15 },
  pill: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  pillText: {
    ...t.text.bodyStrong.style,
    color: t.colors.brandInk,
    fontSize: 15,
  },
}));
