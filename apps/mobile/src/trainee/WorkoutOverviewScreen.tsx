import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronLeft, MessageSquare, Play, Timer } from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type { WorkoutAssignment } from "@fitbud/contracts";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { OverflowMenu } from "../components/OverflowMenu";
import { Screen } from "../components/Screen";
import { localDateInTimezone } from "../lib/dates";
import { estimateDurationMinutesFromDay } from "./workoutDuration";
import { assignmentDayEyebrow } from "./workoutDisplay";

const TARGET = 44;

type Props = {
  assignmentId: string;
  onBack: () => void;
  onStart?: (assignment: WorkoutAssignment) => void;
  startLoading?: boolean;
  coachName?: string;
  onAskCoach?: (assignment: WorkoutAssignment) => void;
};

function totalSets(day: WorkoutAssignment["workoutDay"]): number {
  return day.exercises.reduce((n, ex) => n + ex.setTargets.length, 0);
}

function formatRepsLabel(
  exercise: WorkoutAssignment["workoutDay"]["exercises"][number],
): string {
  const sets = exercise.setTargets.length;
  const first = exercise.setTargets[0];
  if (first?.reps == null) return `${sets} sets`;
  const reps = first.reps;
  const name = exercise.name.toLowerCase();
  if (name.includes("each leg") || name.includes("per leg")) {
    return `${sets} × ${reps} each leg`;
  }
  return `${sets} × ${reps}`;
}

function loadChip(
  exercise: WorkoutAssignment["workoutDay"]["exercises"][number],
): string | null {
  const first = exercise.setTargets[0];
  const load = first?.loadLabel?.trim();
  if (load) return load;
  if (exercise.setTargets.length > 0) return "Bodyweight";
  return null;
}

function restLabel(
  exercise: WorkoutAssignment["workoutDay"]["exercises"][number],
): string | null {
  const first = exercise.setTargets[0];
  const rest = first?.restSeconds;
  if (rest == null || rest <= 0) return null;
  return `Rest ${rest} s`;
}

function canStartWorkout(assignment: WorkoutAssignment): boolean {
  return (
    assignment.status === "assigned" ||
    assignment.status === "missed" ||
    assignment.status === "in_progress" ||
    assignment.status === "paused"
  );
}

function startButtonLabel(assignment: WorkoutAssignment): string {
  if (
    assignment.status === "in_progress" ||
    assignment.status === "paused"
  ) {
    return "Continue workout";
  }
  return "Start workout";
}

export function WorkoutOverviewScreen({
  assignmentId,
  onBack,
  onStart,
  startLoading = false,
  coachName = "Your coach",
  onAskCoach,
}: Props) {
  const { api, me } = useAuth();
  const [assignment, setAssignment] = useState<WorkoutAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const timeZone = me?.timezone ?? "UTC";
  const today = localDateInTimezone(timeZone);

  const load = useCallback(async () => {
    setError(null);
    try {
      const value = await api.getWorkoutAssignment(assignmentId);
      setAssignment(value);
      setOffline(false);
    } catch (err) {
      setOffline(true);
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't load workout. Pull to try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, assignmentId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const duration = useMemo(
    () =>
      assignment != null
        ? estimateDurationMinutesFromDay(assignment.workoutDay)
        : null,
    [assignment],
  );

  const exerciseCount = assignment?.workoutDay.exercises.length ?? 0;
  const setCount =
    assignment != null ? totalSets(assignment.workoutDay) : 0;

  const dateEyebrow =
    assignment != null
      ? assignmentDayEyebrow(assignment, timeZone, today)
      : null;

  // Always pin a bottom bar on the day detail: Start/Continue when actionable,
  // otherwise a muted Done so the layout matches mockup 10b (not a blank footer).
  const showStart =
    assignment != null && onStart != null && canStartWorkout(assignment);
  const showFooterBar = assignment != null && onStart != null;

  const menuItems =
    assignment && onAskCoach
      ? [
          {
            id: "ask",
            label: "Ask coach",
            onSelect: () => onAskCoach(assignment),
          },
        ]
      : [];

  const footer = showFooterBar ? (
    <View style={styles.abar}>
      {showStart ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={startButtonLabel(assignment!)}
          disabled={startLoading}
          onPress={() => onStart!(assignment!)}
          style={[
            styles.startBtn,
            startLoading ? styles.startBtnDisabled : null,
          ]}
        >
          <Play color={colors.white} size={20} fill={colors.white} />
          <Text style={styles.startBtnText}>
            {startButtonLabel(assignment!)}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to workout week"
          onPress={onBack}
          style={styles.startBtn}
        >
          <Text style={styles.startBtnText}>Back to week</Text>
        </Pressable>
      )}
    </View>
  ) : null;

  return (
    <View style={styles.root}>
      <Screen
        chrome="app"
        title="Workout"
        showHeader={false}
        refreshing={refreshing}
        onRefresh={() => {
          void onRefresh();
        }}
        footer={footer}
      >
        <View style={styles.topnav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to workout"
            onPress={onBack}
            style={styles.topnavBack}
          >
            <ChevronLeft color={colors.indigo} size={24} />
            <Text style={styles.topnavLabel}>Workout</Text>
          </Pressable>
          {menuItems.length > 0 ? (
            <OverflowMenu label="Workout day options" items={menuItems} />
          ) : (
            <View style={styles.topnavSpacer} />
          )}
        </View>

        {error ? <ErrorBanner message={error} /> : null}
        {offline ? (
          <Text style={styles.offline}>Saved on phone · Not sent yet</Text>
        ) : null}
        {loading && !assignment ? (
          <Text style={styles.muted}>Loading workout…</Text>
        ) : null}

        {assignment ? (
          <View style={styles.stack}>
            <View style={styles.dayh}>
              {dateEyebrow ? (
                <Text style={styles.eyebrow}>{dateEyebrow}</Text>
              ) : null}
              <Text style={styles.h1} accessibilityRole="header">
                {assignment.workoutDayName}
              </Text>
            </View>

            <View style={styles.dstats}>
              <View style={styles.dstat}>
                <Text style={styles.dstatB}>{exerciseCount}</Text>
                <Text style={styles.dstatS}>
                  {exerciseCount === 1 ? "exercise" : "Exercises"}
                </Text>
              </View>
              <View style={styles.dstat}>
                <Text style={styles.dstatB}>{setCount}</Text>
                <Text style={styles.dstatS}>
                  {setCount === 1 ? "set" : "Sets"}
                </Text>
              </View>
              <View style={styles.dstat}>
                <Text style={styles.dstatB}>
                  {duration != null ? `~${duration} min` : "—"}
                </Text>
                <Text style={styles.dstatS}>Estimated</Text>
              </View>
            </View>

            {assignment.workoutDay.instructions?.trim() ? (
              <View style={styles.note}>
                <MessageSquare color={colors.indigo} size={18} />
                <Text style={styles.noteBody}>
                  <Text style={styles.noteBold}>{coachName}:</Text>{" "}
                  {assignment.workoutDay.instructions.trim()}
                </Text>
              </View>
            ) : null}

            <View style={styles.excCard}>
              {assignment.workoutDay.exercises.map((exercise, index) => {
                const reps = formatRepsLabel(exercise);
                const load = loadChip(exercise);
                const rest = restLabel(exercise);
                const note = exercise.instructions?.trim();
                return (
                  <View
                    key={exercise.id}
                    style={[
                      styles.exc,
                      index > 0 ? styles.excBorder : null,
                    ]}
                  >
                    <View style={styles.excRow}>
                      <View style={styles.exn}>
                        <Text style={styles.exnText}>{index + 1}</Text>
                      </View>
                      <View style={styles.excTx}>
                        <Text style={styles.excName}>{exercise.name}</Text>
                        <View style={styles.pres}>
                          <Text style={styles.presChip}>{reps}</Text>
                          {load ? (
                            <Text style={styles.presChip}>{load}</Text>
                          ) : null}
                          {rest ? (
                            <View style={styles.presChipRow}>
                              <Timer
                                color={colors.midGrey}
                                size={13}
                              />
                              <Text style={styles.presChipText}>{rest}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </View>
                    {note ? (
                      <View style={styles.cn}>
                        <MessageSquare
                          color={colors.indigo}
                          size={15}
                        />
                        <Text style={styles.cnText}>{note}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>

            {showStart ? <View style={styles.abarSpacer} /> : null}
          </View>
        ) : null}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topnav: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.md,
    minHeight: TARGET,
  },
  topnavBack: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    marginLeft: -spacing.xs,
    minHeight: TARGET,
  },
  topnavSpacer: {
    width: TARGET,
  },
  topnavLabel: {
    color: colors.indigo,
    fontSize: 16,
    fontWeight: "600",
  },
  stack: {
    gap: spacing.md,
  },
  dayh: {
    paddingHorizontal: 4,
  },
  eyebrow: {
    color: colors.midGrey,
    fontSize: 14,
    fontWeight: "600",
  },
  h1: {
    color: colors.deepNavy,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.5,
    lineHeight: 36,
    marginTop: 4,
  },
  dstats: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  dstat: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  dstatB: {
    color: colors.deepNavy,
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 24,
  },
  dstatS: {
    color: colors.midGrey,
    fontSize: 12,
    fontWeight: "600",
  },
  note: {
    backgroundColor: "#F9F7FF",
    borderColor: "#E4DEFF",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noteBody: {
    color: colors.darkGrey,
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },
  noteBold: {
    color: colors.deepNavy,
    fontWeight: "700",
  },
  excCard: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: spacing.sm,
    overflow: "hidden",
  },
  exc: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  excBorder: {
    borderTopColor: colors.lightGrey,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  excRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  exn: {
    alignItems: "center",
    backgroundColor: "#F6F4FF",
    borderColor: "#E6E0FF",
    borderRadius: 12,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  exnText: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "700",
  },
  excTx: {
    flex: 1,
    minWidth: 0,
  },
  excName: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 22,
  },
  pres: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 7,
  },
  presChip: {
    backgroundColor: colors.background,
    borderColor: colors.lightGrey,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.darkGrey,
    fontSize: 13,
    fontWeight: "600",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  presChipRow: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.lightGrey,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  presChipText: {
    color: colors.darkGrey,
    fontSize: 13,
    fontWeight: "600",
  },
  cn: {
    flexDirection: "row",
    gap: 6,
    marginLeft: 52,
    marginTop: 8,
  },
  cnText: {
    color: colors.indigo,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  abar: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderTopColor: colors.lightGrey,
    borderTopWidth: 1,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  startBtn: {
    alignItems: "center",
    backgroundColor: colors.indigo,
    borderRadius: radii.control,
    flexDirection: "row",
    gap: spacing.sm,
    height: 56,
    justifyContent: "center",
  },
  startBtnDisabled: {
    opacity: 0.6,
  },
  startBtnText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: "700",
  },
  abarSpacer: {
    height: 72,
  },
  muted: {
    color: colors.midGrey,
    fontSize: 15,
  },
  offline: {
    color: colors.midGrey,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
});
