import { StyleSheet, View } from "react-native";
import type { WorkoutExecution } from "@fitbud/contracts";
import { colors } from "@fitbud/ui-mobile";
import { Text } from "../../../components/Text";
import { coachInitials } from "../../workoutDisplay";
import {
  coachLogMeta,
  coachLogTitle,
  type CoachLogState,
} from "./coachLogged";

/**
 * DS8-w9: "Logged by your coach" (read-only) and "Edited by your coach"
 * (still the trainee's) share this banner.
 */
export function CoachLogBanner({
  state,
  execution,
  coachName,
  timeZone,
}: {
  state: Exclude<CoachLogState, null>;
  execution: WorkoutExecution;
  coachName: string;
  timeZone: string;
}) {
  const firstName = coachName.trim().split(/\s+/)[0] || "your coach";
  const body =
    state === "logged"
      ? `Your coach logged this in your session. It counts toward your week. If something looks wrong, tell ${firstName}.`
      : "Your coach changed this log. It still counts once toward your week.";
  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.top}>
        <View style={styles.av}>
          <Text style={styles.avText}>{coachInitials(coachName)}</Text>
        </View>
        <View style={styles.tx}>
          <Text style={styles.title} accessibilityRole="header">
            {coachLogTitle(state)}
          </Text>
          <Text style={styles.meta}>
            {coachLogMeta(state, execution, coachName, timeZone)}
          </Text>
        </View>
        {state === "logged" ? (
          <View style={styles.done}>
            <Text style={styles.doneText}>Done</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  top: { alignItems: "center", flexDirection: "row", gap: 12 },
  av: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  avText: { color: colors.indigo, fontSize: 15, fontWeight: "600" },
  tx: { flex: 1 },
  title: { color: colors.deepNavy, fontSize: 18, fontWeight: "700" },
  meta: { color: colors.darkGrey, fontSize: 14, marginTop: 2 },
  done: {
    backgroundColor: "#E6F7EF",
    borderColor: "#BFE8D4",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  doneText: { color: colors.success, fontSize: 14, fontWeight: "700" },
  body: { color: colors.darkGrey, fontSize: 15, lineHeight: 22, marginTop: 12 },
});
