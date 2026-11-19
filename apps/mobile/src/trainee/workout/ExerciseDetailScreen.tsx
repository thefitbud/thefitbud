/**
 * Exercise detail from the active log (Z12-45): How to (W-27) and History
 * (W-26). Everything shown has a source: the plan's exercise (muscles,
 * equipment, the coach's note), this session's sets, the earlier sessions of
 * the same workout day, and the strength read model for the bests.
 *
 * Numbered library steps, library muscles and library equipment live in
 * `exercise_library_*` but no trainee API exposes them yet (contracts are
 * outside this task) — see the W12-cursor follow-up. Until then How to only
 * opens when the plan exercise itself carries a note, muscles or equipment.
 */
import { Pressable, View } from "react-native";
import { ChevronLeft, Medal } from "lucide-react-native";
import type { WorkoutExercise } from "@fitbud/contracts";
import { Screen } from "../../components/Screen";
import { SegmentedControl } from "../../components/SegmentedControl";
import { Text } from "../../components/Text";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import {
  formatCivilDateShort,
  type ExerciseBest,
  type HistorySet,
} from "../workoutDisplay";

export type ExerciseDetailTab = "how_to" | "history";

export type ExerciseDetailSession = {
  key: string;
  workoutDayName: string;
  /** "Today", or the civil date ("Sat 7 Nov"). */
  when: string;
  sets: HistorySet[];
  /** Orders of the sets that are records (this session only). */
  recordOrders?: ReadonlySet<number>;
};

/** True when How to would show a coach note, muscles or equipment. */
export function exerciseHasHowTo(
  exercise: Pick<
    WorkoutExercise,
    "instructions" | "primaryMuscles" | "secondaryMuscles" | "equipment"
  > | null,
): boolean {
  if (!exercise) return false;
  if (exercise.instructions?.trim()) return true;
  if ((exercise.primaryMuscles?.length ?? 0) > 0) return true;
  if ((exercise.secondaryMuscles?.length ?? 0) > 0) return true;
  if ((exercise.equipment?.length ?? 0) > 0) return true;
  return false;
}

export function ExerciseDetailScreen({
  name,
  tab,
  onTabChange,
  onBack,
  exercise,
  coachInitials,
  best,
  sessions,
  historyLoading,
}: {
  name: string;
  tab: ExerciseDetailTab;
  onTabChange: (tab: ExerciseDetailTab) => void;
  onBack: () => void;
  /** The plan's exercise; null when the plan could not be read. */
  exercise: WorkoutExercise | null;
  coachInitials: string;
  /** Heaviest load before today, or null when there is none on record. */
  best: ExerciseBest | null;
  /** Today's sets first, then earlier sessions, newest first. */
  sessions: readonly ExerciseDetailSession[];
  historyLoading: boolean;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const cue = exercise?.instructions?.trim() || null;
  const tags = [
    ...(exercise?.primaryMuscles ?? []).map((label) => ({ label, primary: true })),
    ...(exercise?.secondaryMuscles ?? []).map((label) => ({ label, primary: false })),
    ...(exercise?.equipment ?? []).map((label) => ({ label, primary: false })),
  ];
  const hasHowTo = exerciseHasHowTo(exercise);
  // Never land on an empty How to page.
  const activeTab: ExerciseDetailTab = hasHowTo && tab === "how_to" ? "how_to" : "history";
  // The heaviest set on record, this session included.
  const todayBest = sessions
    .flatMap((session) => (session.when === "Today" ? session.sets : []))
    .filter((set) => set.kg != null)
    .reduce<HistorySet | null>(
      (top, set) => (top == null || set.kg! > top.kg! ? set : top),
      null,
    );
  const heaviestKg = Math.max(best?.kg ?? 0, todayBest?.kg ?? 0);
  const bestSetLabel =
    todayBest && todayBest.kg! >= (best?.kg ?? 0)
      ? todayBest.label.replace(" kg", "")
      : best
        ? `${best.kg}${best.reps != null ? ` × ${best.reps}` : ""}`
        : null;

  return (
    <Screen v3 chrome="app" title={name} showHeader={false}>
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to workout"
          onPress={onBack}
          style={styles.back}
        >
          <ChevronLeft color={theme.colors.ink} size={24} strokeWidth={2.2} />
        </Pressable>
        <Text
          variant="headline"
          style={styles.navTitle}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {name}
        </Text>
        <View style={styles.back} />
      </View>
      {hasHowTo ? (
        <SegmentedControl
          options={[
            { id: "how_to", label: "How to" },
            { id: "history", label: "History" },
          ]}
          value={activeTab}
          onChange={onTabChange}
        />
      ) : null}

      {activeTab === "how_to" ? (
        <View style={styles.section}>
          {tags.length > 0 ? (
            <View style={styles.tags}>
              {tags.map((tag, index) => (
                <View
                  key={`${tag.label}-${index}`}
                  style={[styles.tag, tag.primary ? styles.tagPrimary : null]}
                >
                  <Text style={[styles.tagText, tag.primary ? styles.tagPrimaryText : null]}>
                    {tag.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {cue ? (
            <View style={styles.cue}>
              <View style={styles.coachAv}>
                <Text style={styles.coachAvText}>{coachInitials}</Text>
              </View>
              <Text variant="body" style={styles.cueText}>
                {cue}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.section}>
          {heaviestKg > 0 ? (
            <View style={styles.bests}>
              <View style={styles.bestTile}>
                <Text variant="caption">Best set</Text>
                <Text variant="numberLg">{bestSetLabel}</Text>
              </View>
              <View style={styles.bestTile}>
                <Text variant="caption">Heaviest</Text>
                <Text variant="numberLg">
                  {heaviestKg}
                  <Text style={styles.unit}> kg</Text>
                </Text>
              </View>
            </View>
          ) : null}
          {sessions.map((session, index) => (
            <View
              key={session.key}
              style={[styles.session, index > 0 ? styles.sessionRule : null]}
            >
              <View style={styles.sessionHead}>
                <Text variant="headline" numberOfLines={1} style={styles.flex1}>
                  {session.workoutDayName}
                </Text>
                <Text variant="caption">{session.when}</Text>
              </View>
              {session.sets.map((set, position) => (
                <View key={set.order} style={styles.hrow}>
                  <View style={styles.sn}>
                    <Text style={styles.snText}>{position + 1}</Text>
                  </View>
                  <Text variant="numberSm" style={styles.flex1}>
                    {set.label}
                  </Text>
                  {session.recordOrders?.has(set.order) ? (
                    <View style={styles.prTag} accessibilityLabel="Personal record">
                      <Medal color={theme.colors.pr} size={11} strokeWidth={2.4} />
                      <Text style={styles.prTagText}>PR</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ))}
          {sessions.length === 0 ? (
            <Text variant="body" tone="ink2">
              {historyLoading
                ? "Loading your earlier sessions…"
                : "No logged sets for this exercise yet."}
            </Text>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

/** "Today", else "Sat 7 Nov". */
export function historyWhen(localDate: string, today: string): string {
  return localDate === today ? "Today" : formatCivilDateShort(localDate);
}

const useStyles = createThemedStyles((t) => ({
  flex1: { flex: 1, minWidth: 0 },
  nav: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 8,
    marginHorizontal: -10,
    minHeight: t.touchTarget,
  },
  back: {
    alignItems: "center",
    height: t.touchTarget,
    justifyContent: "center",
    width: t.touchTarget,
  },
  navTitle: { flex: 1, textAlign: "center" },
  section: { gap: 14, marginTop: 14 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: {
    backgroundColor: t.colors.fill,
    borderRadius: 7,
    justifyContent: "center",
    minHeight: 24,
    paddingHorizontal: 8,
  },
  tagPrimary: { backgroundColor: t.colors.brandTint },
  tagText: { color: t.colors.ink2, fontSize: 12.5, fontWeight: "600" },
  tagPrimaryText: { color: t.colors.brandInk },
  cue: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  coachAv: {
    alignItems: "center",
    backgroundColor: t.colors.coach,
    borderRadius: 12,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  coachAvText: { color: t.colors.onCoach, fontSize: 10, fontWeight: "700" },
  cueText: { flex: 1, fontSize: 15, lineHeight: 21 },
  bests: { flexDirection: "row", gap: 8 },
  bestTile: {
    backgroundColor: t.colors.card,
    borderRadius: 14,
    flex: 1,
    padding: 12,
  },
  unit: { ...t.text.subhead.style, color: t.colors.ink3, fontSize: 14 },
  session: { gap: 0 },
  sessionRule: {
    borderTopColor: t.colors.line,
    borderTopWidth: 0.5,
    paddingTop: 14,
  },
  sessionHead: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 2,
  },
  hrow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    height: 42,
  },
  sn: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 8,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  snText: {
    color: t.colors.ink,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  prTag: {
    alignItems: "center",
    backgroundColor: t.colors.prTint,
    borderRadius: 6,
    flexDirection: "row",
    gap: 2,
    height: 19,
    paddingLeft: 4,
    paddingRight: 6,
  },
  prTagText: { color: t.colors.pr, fontSize: 11, fontWeight: "700" },
}));
