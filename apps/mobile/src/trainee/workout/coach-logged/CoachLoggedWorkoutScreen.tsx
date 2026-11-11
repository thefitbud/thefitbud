import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Check, ChevronDown, ChevronLeft, Lock } from "lucide-react-native";
import type { WorkoutAssignment, WorkoutExecution } from "@fitbud/contracts";
import { colors } from "@fitbud/ui-mobile";
import { Screen } from "../../../components/Screen";
import { Text } from "../../../components/Text";
import { CoachLogBanner } from "./CoachLogBanner";

function loadText(label: string | null): string {
  return label?.trim() ? label.trim() : "—";
}

/**
 * Read-only view of a workout the coach logged (DS8-w9, R1). There is no
 * Start, Edit or note box: the trainee can only read it and go back.
 */
export function CoachLoggedWorkoutScreen({
  execution,
  assignment = null,
  coachName,
  timeZone,
  onBack,
}: {
  execution: WorkoutExecution;
  assignment?: WorkoutAssignment | null;
  coachName: string;
  timeZone: string;
  onBack: () => void;
}) {
  const exercises = [...execution.exercises].sort((a, b) => a.order - b.order);
  const [openId, setOpenId] = useState<string | null>(exercises[0]?.id ?? null);

  return (
    <Screen chrome="app" title="Workout" showHeader={false}>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.back}
        >
          <ChevronLeft color={colors.deepNavy} size={24} />
        </Pressable>
        <Text style={styles.barTitle} accessibilityRole="header">
          {assignment?.workoutDayName ?? "Workout"}
        </Text>
        <View style={styles.back} />
      </View>

      <CoachLogBanner
        state="logged"
        execution={execution}
        coachName={coachName}
        timeZone={timeZone}
      />

      {exercises.map((exercise) => {
        const open = exercise.id === openId;
        const sets = [...exercise.sets].sort((a, b) => a.order - b.order);
        const first = sets.find((s) => s.actualLoadLabel)?.actualLoadLabel;
        return (
          <View key={exercise.id} style={styles.card}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={`${exercise.name}, ${sets.length} ${sets.length === 1 ? "set" : "sets"}`}
              onPress={() => setOpenId(open ? null : exercise.id)}
              style={styles.exHead}
            >
              {open ? (
                <Text style={styles.exName}>{exercise.name}</Text>
              ) : (
                <>
                  <View style={styles.tick}>
                    <Check color={colors.white} size={18} />
                  </View>
                  <View style={styles.tx}>
                    <Text style={styles.exName}>{exercise.name}</Text>
                    <Text style={styles.sub}>
                      {sets.length} {sets.length === 1 ? "set" : "sets"}
                      {first ? ` · ${first}` : ""}
                    </Text>
                  </View>
                </>
              )}
              {open ? (
                <Text style={styles.sub}>
                  {sets.length} {sets.length === 1 ? "set" : "sets"}
                </Text>
              ) : (
                <ChevronDown color={colors.deepNavy} size={20} />
              )}
            </Pressable>
            {open
              ? sets.map((set) => (
                  <View key={set.id} style={styles.setRow}>
                    <Text style={styles.setNo}>{set.order}</Text>
                    <Text style={styles.setVal}>
                      {loadText(set.actualLoadLabel)}
                    </Text>
                    <Text style={styles.setVal}>{set.actualReps ?? "—"}</Text>
                    {set.status === "skipped" ? (
                      <Text style={styles.skipped}>Skipped</Text>
                    ) : (
                      <View style={styles.tick}>
                        <Check color={colors.white} size={18} />
                      </View>
                    )}
                  </View>
                ))
              : null}
          </View>
        );
      })}

      <View style={styles.lock}>
        <Lock color={colors.darkGrey} size={18} />
        <Text style={styles.lockText}>
          Read-only · only your coach can change it
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  back: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  barTitle: { color: colors.deepNavy, fontSize: 20, fontWeight: "600" },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  exHead: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 44,
  },
  tx: { flex: 1 },
  exName: { color: colors.deepNavy, fontSize: 18, fontWeight: "600" },
  sub: { color: colors.darkGrey, fontSize: 15, marginTop: 2 },
  tick: {
    alignItems: "center",
    backgroundColor: colors.deepNavy,
    borderRadius: 12,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  setRow: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderRadius: 14,
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  setNo: {
    color: colors.deepNavy,
    fontSize: 18,
    fontVariant: ["tabular-nums"],
    width: 28,
  },
  setVal: {
    color: colors.deepNavy,
    flex: 1,
    fontSize: 20,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    textAlign: "center",
  },
  skipped: { color: colors.darkGrey, fontSize: 14, width: 56, textAlign: "center" },
  lock: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 20,
  },
  lockText: { color: colors.darkGrey, fontSize: 15 },
});
