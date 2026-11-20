/**
 * TM-10a/b: Asked you detail — open ask with context, pain caution, WhatsApp.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  Check,
  HeartPulse,
  MessageCircleQuestionMark,
} from "lucide-react-native";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CoachAsk,
  MealAssignment,
  WorkoutAssignment,
  WorkoutExecution,
} from "@fitbud/contracts";
import { formatPersonName } from "@fitbud/core";
import { v3LightColors } from "@fitbud/tokens";
import { colors, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Screen } from "../../components/Screen";
import { Text } from "../../components/Text";
import { initialsFromName } from "../../components/m2";
import { createIdempotencyKey } from "../../lib/idempotency";
import { reportError } from "../../lib/reportError";
import { stage1Api } from "../../lib/stage1Api";
import { openContextualWhatsApp } from "../whatsapp";
import {
  askMentionsPain,
  askPainBanner,
  askQuestionQuote,
  askSubtitle,
  buildAskContext,
  coachingWeekNumber,
} from "./model";

type Props = {
  askId: string;
  /** Optional seed when opened from Needs you (avoids a list round-trip). */
  initialAsk?: CoachAsk | null;
  relationshipId?: string;
  displayName?: string;
  onBack: () => void;
  onAnswered?: () => void;
};

const AVATARS = [
  { backgroundColor: v3LightColors.av1Bg, color: v3LightColors.av1Fg },
  { backgroundColor: v3LightColors.av2Bg, color: v3LightColors.av2Fg },
  { backgroundColor: v3LightColors.av3Bg, color: v3LightColors.av3Fg },
  { backgroundColor: v3LightColors.av4Bg, color: v3LightColors.av4Fg },
  { backgroundColor: v3LightColors.av5Bg, color: v3LightColors.av5Fg },
  { backgroundColor: v3LightColors.av6Bg, color: v3LightColors.av6Fg },
] as const;

function avatarTone(name: string) {
  const code = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return AVATARS[code % AVATARS.length] ?? AVATARS[0]!;
}

export function AskDetailScreen({
  askId,
  initialAsk = null,
  relationshipId: ridProp,
  displayName: nameProp,
  onBack,
  onAnswered,
}: Props) {
  const { api } = useAuth();
  const s1 = stage1Api(api);
  const [ask, setAsk] = useState<CoachAsk | null>(initialAsk);
  const [name, setName] = useState(nameProp?.trim() || "Client");
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const [goalShort, setGoalShort] = useState<string | null>(null);
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [assignment, setAssignment] = useState<WorkoutAssignment | null>(null);
  const [execution, setExecution] = useState<WorkoutExecution | null>(null);
  const [meal, setMeal] = useState<MealAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      let found = initialAsk?.id === askId ? initialAsk : null;
      if (!found) {
        const open = await s1.listCoachAsks({ status: "open" });
        found = open.items.find((item) => item.id === askId) ?? null;
      }
      if (!found) {
        const answered = await s1.listCoachAsks({ status: "answered" });
        found = answered.items.find((item) => item.id === askId) ?? null;
      }
      if (!found) {
        setAsk(null);
        setError("This ask is no longer available.");
        setOffline(false);
        return;
      }
      setAsk(found);

      const rid = ridProp || found.relationshipId;
      let nextName = nameProp?.trim() || "Client";
      let nextWa: string | null = null;
      let nextGoal: string | null = null;
      let nextWeek: number | null = null;
      try {
        const ws = await api.getClientWorkspace(rid);
        nextName = formatPersonName(ws.header.traineeDisplayName);
        nextWa = ws.header.clientWhatsappE164 ?? null;
        nextGoal = ws.header.goalShort ?? null;
        nextWeek = coachingWeekNumber(ws.header.startedAt);
      } catch (workspaceError) {
        reportError("askDetail.workspace", workspaceError);
      }
      setName(nextName);
      setWhatsapp(nextWa);
      setGoalShort(nextGoal);
      setWeekNumber(nextWeek);

      let nextAssignment: WorkoutAssignment | null = null;
      let nextExecution: WorkoutExecution | null = null;
      let nextMeal: MealAssignment | null = null;
      try {
        if (
          found.itemType === "workout_assignment" ||
          found.itemType === "exercise_execution"
        ) {
          if (found.itemType === "workout_assignment") {
            nextAssignment = await api.getWorkoutAssignment(found.itemId);
          } else if (found.itemDate) {
            const page = await api.listWorkoutAssignments(rid, {
              fromDate: found.itemDate,
              toDate: found.itemDate,
            });
            for (const item of page.items) {
              if (!item.execution?.id) continue;
              try {
                const exec = await api.getWorkoutExecution(item.execution.id);
                if (exec.exercises.some((ex) => ex.id === found.itemId)) {
                  nextAssignment = item;
                  nextExecution = exec;
                  break;
                }
              } catch {
                /* try next */
              }
            }
            if (!nextAssignment && page.items[0]) {
              nextAssignment = page.items[0]!;
            }
          }
          if (nextAssignment?.execution?.id && !nextExecution) {
            nextExecution = await api.getWorkoutExecution(
              nextAssignment.execution.id,
            );
          }
        } else if (found.itemType === "meal_assignment") {
          nextMeal = await api.getMealAssignment(found.itemId);
        }
      } catch (sourceError) {
        reportError("askDetail.source", sourceError);
      }
      setAssignment(nextAssignment);
      setExecution(nextExecution);
      setMeal(nextMeal);
      setOffline(false);
    } catch (err) {
      const network =
        err instanceof TypeError ||
        (err instanceof ApiClientError && err.status === 0) ||
        (err instanceof Error && /fetch|network|offline/i.test(err.message));
      if (network) {
        setOffline(true);
        setError(null);
      } else {
        setError(
          err instanceof ApiClientError
            ? err.message
            : "Couldn't load this ask.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [api, askId, initialAsk, nameProp, ridProp, s1]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const answered = ask?.status === "answered";
  const pain = ask ? askMentionsPain(ask) : false;
  const first = name.split(" ")[0] || name;
  const tone = avatarTone(name);
  const context = useMemo(
    () =>
      ask
        ? buildAskContext({ ask, assignment, execution, meal })
        : { about: "—", loggedSoFar: null, plan: null },
    [ask, assignment, execution, meal],
  );
  const subtitle = ask
    ? askSubtitle({
        goalShort,
        weekNumber,
        lastAskedAt: ask.lastAskedAt,
      })
    : "";

  async function markAnswered() {
    if (!ask || answered || offline || acting) return;
    setActing(true);
    setError(null);
    try {
      const updated = await (
        s1.answerCoachAsk as unknown as (
          id: string,
          body: { note?: string | null },
          idempotencyKey: string,
        ) => Promise<CoachAsk>
      )(ask.id, { note: null }, createIdempotencyKey());
      setAsk(updated);
      onAnswered?.();
    } catch (err) {
      reportError("askDetail.markAnswered", err);
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't mark answered. Try again.",
      );
    } finally {
      setActing(false);
    }
  }

  const footer =
    ask && !answered ? (
      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          disabled={acting || offline}
          onPress={() => void markAnswered()}
          style={[styles.secondaryBtn, offline || acting ? styles.disabled : null]}
        >
          <Text style={styles.secondaryText}>Mark answered</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            void openContextualWhatsApp({
              phoneE164: whatsapp,
              draftText: `Hi ${first}, about your question on FitBud…`,
            })
          }
          style={styles.primaryBtn}
        >
          <Text style={styles.primaryText}>Reply on WhatsApp</Text>
        </Pressable>
      </View>
    ) : null;

  return (
    <Screen
      v3
      title="Asked you"
      chrome="app"
      showHeader={false}
      footer={footer ?? undefined}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load().finally(() => setRefreshing(false));
      }}
    >
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.navBtn}
        >
          <Text style={styles.navChevron}>‹</Text>
        </Pressable>
        <Text style={styles.navTitle} accessibilityRole="header">
          Asked you
        </Text>
        <View style={styles.navBtn} />
      </View>

      {offline ? (
        <ErrorBanner message="You're offline. Reconnect to load this ask." />
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}

      {answered ? (
        <View style={styles.answeredBanner} accessibilityRole="summary">
          <Check color={v3LightColors.done} size={16} strokeWidth={2.4} />
          <Text style={styles.answeredText}>Answered on WhatsApp.</Text>
        </View>
      ) : null}

      {loading && !ask ? (
        <View style={styles.skelCard}>
          <View style={styles.skel} />
          <View style={styles.skel} />
        </View>
      ) : ask ? (
        <>
          <View style={styles.who}>
            <View
              style={[styles.avatar, { backgroundColor: tone.backgroundColor }]}
            >
              <Text style={[styles.avatarText, { color: tone.color }]}>
                {initialsFromName(name)}
              </Text>
            </View>
            <View style={styles.whoBody}>
              <Text style={styles.name}>{name}</Text>
              {subtitle ? <Text style={styles.meta}>{subtitle}</Text> : null}
              <View style={styles.chips}>
                {pain ? (
                  <View style={[styles.chip, styles.chipPain]}>
                    <HeartPulse
                      color={v3LightColors.crit}
                      size={12}
                      strokeWidth={2.2}
                    />
                    <Text style={styles.chipPainText}>Mentions pain</Text>
                  </View>
                ) : null}
                {answered ? (
                  <View style={[styles.chip, styles.chipDone]}>
                    <Check
                      color={v3LightColors.done}
                      size={12}
                      strokeWidth={2.4}
                    />
                    <Text style={styles.chipDoneText}>Answered</Text>
                  </View>
                ) : (
                  <View style={[styles.chip, styles.chipAsk]}>
                    <MessageCircleQuestionMark
                      color={v3LightColors.brand}
                      size={12}
                      strokeWidth={2.2}
                    />
                    <Text style={styles.chipAskText}>Asked you</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.askedLabel}>{`${first.toUpperCase()} ASKED`}</Text>
            <Text style={styles.quote}>{askQuestionQuote(ask)}</Text>
            <View style={styles.divider} />
            <ContextRow label="About" value={context.about} />
            {context.loggedSoFar ? (
              <ContextRow label="Logged so far" value={context.loggedSoFar} />
            ) : null}
            {context.plan ? (
              <ContextRow label="Plan" value={context.plan} />
            ) : null}
          </View>

          {pain ? (
            <View style={styles.painBanner} accessibilityRole="summary">
              <HeartPulse
                color={v3LightColors.crit}
                size={16}
                strokeWidth={2.2}
              />
              <Text style={styles.painText}>{askPainBanner()}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  navBtn: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  navChevron: {
    color: v3LightColors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 28,
    lineHeight: 32,
    marginTop: -2,
  },
  navTitle: {
    color: v3LightColors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
    fontWeight: "600",
  },
  answeredBanner: {
    alignItems: "center",
    backgroundColor: v3LightColors.doneTint,
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  answeredText: {
    color: v3LightColors.doneInk,
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  who: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    marginTop: 4,
  },
  avatar: {
    alignItems: "center",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  avatarText: {
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
    fontWeight: "700",
  },
  whoBody: { flex: 1, minWidth: 0 },
  name: {
    color: v3LightColors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
    fontWeight: "700",
  },
  meta: {
    color: v3LightColors.ink3,
    fontSize: 13,
    marginTop: 2,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  chip: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipPain: { backgroundColor: v3LightColors.critTint },
  chipPainText: {
    color: v3LightColors.crit,
    fontSize: 12,
    fontWeight: "600",
  },
  chipAsk: { backgroundColor: v3LightColors.brandTint },
  chipAskText: {
    color: v3LightColors.brand,
    fontSize: 12,
    fontWeight: "600",
  },
  chipDone: { backgroundColor: v3LightColors.doneTint },
  chipDoneText: {
    color: v3LightColors.done,
    fontSize: 12,
    fontWeight: "600",
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
  },
  askedLabel: {
    color: v3LightColors.ink3,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  quote: {
    color: v3LightColors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 26,
  },
  divider: {
    backgroundColor: v3LightColors.line,
    height: StyleSheet.hairlineWidth,
    marginVertical: 14,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginBottom: 10,
  },
  rowLabel: {
    color: v3LightColors.ink3,
    flexShrink: 0,
    fontSize: 14,
  },
  rowValue: {
    color: v3LightColors.ink,
    flex: 1,
    fontFamily: fontFamilySemiBold,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
  },
  painBanner: {
    alignItems: "flex-start",
    backgroundColor: v3LightColors.critTint,
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  painText: {
    color: v3LightColors.critInk,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryBtn: {
    alignItems: "center",
    backgroundColor: v3LightColors.fill,
    borderRadius: 14,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  secondaryText: {
    color: v3LightColors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
    fontWeight: "600",
  },
  primaryBtn: {
    alignItems: "center",
    backgroundColor: v3LightColors.brand,
    borderRadius: 14,
    flex: 1.2,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  primaryText: {
    color: colors.white,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
    fontWeight: "600",
  },
  disabled: { opacity: 0.45 },
  skelCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    gap: 10,
    padding: 16,
  },
  skel: {
    backgroundColor: v3LightColors.skel1,
    borderRadius: 8,
    height: 16,
  },
});
