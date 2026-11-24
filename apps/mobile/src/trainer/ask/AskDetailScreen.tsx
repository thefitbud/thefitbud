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
import type { ColorTokens } from "@fitbud/tokens";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Screen } from "../../components/Screen";
import { Text } from "../../components/Text";
import { initialsFromName } from "../../components/m2";
import { createIdempotencyKey } from "../../lib/idempotency";
import { reportError } from "../../lib/reportError";
import { stage1Api } from "../../lib/stage1Api";
import {
  clientMetaFromWorkspaceHeader,
  readClientMeta,
  trainerCacheEpoch,
  writeClientMeta,
} from "../cache";
import { openContextualWhatsApp } from "../whatsapp";
import {
  askMentionsPain,
  askPainBanner,
  askQuestionQuote,
  askSubtitle,
  buildAskContext,
  coachingWeekNumber,
} from "./model";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";

type Props = {
  askId: string;
  /** Optional seed when opened from Needs you (avoids a list round-trip). */
  initialAsk?: CoachAsk | null;
  relationshipId?: string;
  displayName?: string;
  onBack: () => void;
  onAnswered?: () => void;
};

function avatars(c: ColorTokens) {
  return [
    { backgroundColor: c.av1Bg, color: c.av1Fg },
    { backgroundColor: c.av2Bg, color: c.av2Fg },
    { backgroundColor: c.av3Bg, color: c.av3Fg },
    { backgroundColor: c.av4Bg, color: c.av4Fg },
    { backgroundColor: c.av5Bg, color: c.av5Fg },
    { backgroundColor: c.av6Bg, color: c.av6Fg },
  ] as const;
}

function avatarTone(name: string, c: ColorTokens) {
  const list = avatars(c);
  const code = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return list[code % list.length] ?? list[0]!;
}

export function AskDetailScreen({
  askId,
  initialAsk = null,
  relationshipId: ridProp,
  displayName: nameProp,
  onBack,
  onAnswered,
}: Props) {

  const theme = useTheme();
  const styles = useStyles();
  const { api } = useAuth();
  const s1 = stage1Api(api);
  const [ask, setAsk] = useState<CoachAsk | null>(initialAsk);
  // Z14-3: the header paints from the per-client cache at once.
  const [meta] = useState(() => (ridProp ? readClientMeta(ridProp) : null));
  const [name, setName] = useState(
    nameProp?.trim() || (meta?.name ? formatPersonName(meta.name) : "Client"),
  );
  const [whatsapp, setWhatsapp] = useState<string | null>(
    meta?.whatsappE164 ?? null,
  );
  const [goalShort, setGoalShort] = useState<string | null>(
    meta?.goalShort ?? null,
  );
  const [weekNumber, setWeekNumber] = useState<number | null>(
    meta?.startedAt ? coachingWeekNumber(meta.startedAt) : (meta?.week ?? null),
  );
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
    const cacheEpoch = trainerCacheEpoch();
    try {
      // The header read starts beside the ask lookup when the client is known
      // up front (always, except a cold push); a full cache entry needs none.
      const knownMeta = ridProp ? readClientMeta(ridProp) : null;
      const earlyWorkspace =
        ridProp && knownMeta?.timeZone == null
          ? api.getClientWorkspace(ridProp).then(
              (ws) => ({ ws }) as const,
              (workspaceError: unknown) => ({ workspaceError }) as const,
            )
          : null;
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
      if (knownMeta && knownMeta.timeZone != null) {
        nextName = nameProp?.trim() || formatPersonName(knownMeta.name ?? "Client");
        nextWa = knownMeta.whatsappE164;
        nextGoal = knownMeta.goalShort;
        nextWeek = coachingWeekNumber(knownMeta.startedAt);
      } else {
        const read =
          (await earlyWorkspace) ??
          (await api.getClientWorkspace(rid).then(
            (ws) => ({ ws }) as const,
            (workspaceError: unknown) => ({ workspaceError }) as const,
          ));
        if ("ws" in read) {
          const ws = read.ws;
          writeClientMeta(rid, clientMetaFromWorkspaceHeader(ws.header), cacheEpoch);
          nextName = formatPersonName(ws.header.traineeDisplayName);
          nextWa = ws.header.clientWhatsappE164 ?? null;
          nextGoal = ws.header.goalShort ?? null;
          nextWeek = coachingWeekNumber(ws.header.startedAt);
        } else {
          reportError("askDetail.workspace", read.workspaceError);
        }
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
  const tone = avatarTone(name, theme.colors);
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
          <Check color={theme.colors.done} size={16} strokeWidth={2.4} />
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
                      color={theme.colors.crit}
                      size={12}
                      strokeWidth={2.2}
                    />
                    <Text style={styles.chipPainText}>Mentions pain</Text>
                  </View>
                ) : null}
                {answered ? (
                  <View style={[styles.chip, styles.chipDone]}>
                    <Check
                      color={theme.colors.done}
                      size={12}
                      strokeWidth={2.4}
                    />
                    <Text style={styles.chipDoneText}>Answered</Text>
                  </View>
                ) : (
                  <View style={[styles.chip, styles.chipAsk]}>
                    <MessageCircleQuestionMark
                      color={theme.colors.brand}
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
                color={theme.colors.crit}
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

  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
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
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 28,
    lineHeight: 32,
    marginTop: -2,
  },
  navTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
    fontWeight: "600",
  },
  answeredBanner: {
    alignItems: "center",
    backgroundColor: t.colors.doneTint,
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  answeredText: {
    color: t.colors.doneInk,
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
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
    fontWeight: "700",
  },
  meta: {
    color: t.colors.ink3,
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
  chipPain: { backgroundColor: t.colors.critTint },
  chipPainText: {
    color: t.colors.crit,
    fontSize: 12,
    fontWeight: "600",
  },
  chipAsk: { backgroundColor: t.colors.brandTint },
  chipAskText: {
    color: t.colors.brand,
    fontSize: 12,
    fontWeight: "600",
  },
  chipDone: { backgroundColor: t.colors.doneTint },
  chipDoneText: {
    color: t.colors.done,
    fontSize: 12,
    fontWeight: "600",
  },
  card: {
    backgroundColor: t.colors.card,
    borderRadius: 16,
    padding: 16,
  },
  askedLabel: {
    color: t.colors.ink3,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  quote: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 26,
  },
  divider: {
    backgroundColor: t.colors.line,
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
    color: t.colors.ink3,
    flexShrink: 0,
    fontSize: 14,
  },
  rowValue: {
    color: t.colors.ink,
    flex: 1,
    fontFamily: fontFamilySemiBold,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
  },
  painBanner: {
    alignItems: "flex-start",
    backgroundColor: t.colors.critTint,
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  painText: {
    color: t.colors.critInk,
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
    backgroundColor: t.colors.fill,
    borderRadius: 14,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  secondaryText: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
    fontWeight: "600",
  },
  primaryBtn: {
    alignItems: "center",
    backgroundColor: t.colors.brand,
    borderRadius: 14,
    flex: 1.2,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  primaryText: {
    color: t.colors.card,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
    fontWeight: "600",
  },
  disabled: { opacity: 0.45 },
  skelCard: {
    backgroundColor: t.colors.card,
    borderRadius: 16,
    gap: 10,
    padding: 16,
  },
  skel: {
    backgroundColor: t.colors.skel1,
    borderRadius: 8,
    height: 16,
  },
}));
