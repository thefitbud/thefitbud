/**
 * TM-11a/b: trainer view of a finished trainee workout (sets vs plan).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Check,
  Eye,
  HeartPulse,
  NotebookPen,
  TriangleAlert,
} from "lucide-react-native";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CoachAsk,
  WorkoutAssignment,
  WorkoutExecution,
} from "@fitbud/contracts";
import { deviceTimeZone,
  formatLocalDate,
  formatPersonName,
} from "@fitbud/core";
import type { ColorTokens } from "@fitbud/tokens";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Screen } from "../../components/Screen";
import { Text } from "../../components/Text";
import { ClientAvatar, ClientNameLink } from "../ClientAvatar";
import { createIdempotencyKey } from "../../lib/idempotency";
import { reportError } from "../../lib/reportError";
import { stage1Api } from "../../lib/stage1Api";
import { NoteSheet, type NoteSaveInput } from "../sheets/NoteSheet";
import {
  clientMetaFromWorkspaceHeader,
  readClientMeta,
  trainerCacheEpoch,
  writeClientMeta,
} from "../cache";
import { openContextualWhatsApp } from "../whatsapp";
import { changeChipLabel,
  changeChips,
  earlyFinishBanner,
  sessionExerciseCards,
  sessionMetrics,
  sessionNoteText,
  sessionStatus,
  sessionStatusLabel,
  sessionSubtitle,
} from "./model";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";

type Props = {
  executionId: string;
  relationshipId?: string;
  displayName?: string;
  onBack: () => void;
  /** Avatar or name tap: opens the client's profile on top (Z14-19). */
  onOpenClient?: (relationshipId: string) => void;
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

export function SessionDetailScreen({
  executionId,
  relationshipId: ridProp,
  displayName: nameProp,
  onBack,
  onOpenClient,
}: Props) {

  const theme = useTheme();
  const styles = useStyles();
  const { api } = useAuth();
  const s1 = stage1Api(api);
  const zone = deviceTimeZone();
  const today = formatLocalDate(new Date(), zone);
  const [execution, setExecution] = useState<WorkoutExecution | null>(null);
  const [assignment, setAssignment] = useState<WorkoutAssignment | null>(null);
  const [askExerciseIds, setAskExerciseIds] = useState<Set<string>>(new Set());
  // Z14-3: the header paints from the per-client cache at once.
  const [meta] = useState(() => (ridProp ? readClientMeta(ridProp) : null));
  const [name, setName] = useState(
    nameProp?.trim() || (meta?.name ? formatPersonName(meta.name) : "Client"),
  );
  const [whatsapp, setWhatsapp] = useState<string | null>(
    meta?.whatsappE164 ?? null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteActing, setNoteActing] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const cacheEpoch = trainerCacheEpoch();
    try {
      // The header read starts beside the execution read when the client is
      // known up front; a full cache entry needs none.
      const knownMeta = ridProp ? readClientMeta(ridProp) : null;
      const earlyWorkspace =
        ridProp && knownMeta?.timeZone == null
          ? api.getClientWorkspace(ridProp).then(
              (ws) => ({ ws }) as const,
              (workspaceError: unknown) => ({ workspaceError }) as const,
            )
          : null;
      const exec = await api.getWorkoutExecution(executionId);
      setExecution(exec);
      const rid = ridProp || exec.coachingRelationshipId;
      // One parallel round: header, assignment and both ask lists.
      const [workspaceRead, assignmentRead, openAsks, answeredAsks] =
        await Promise.all([
          knownMeta && knownMeta.timeZone != null
            ? Promise.resolve({ meta: knownMeta } as const)
            : (
                earlyWorkspace ??
                api.getClientWorkspace(rid).then(
                  (ws) => ({ ws }) as const,
                  (workspaceError: unknown) => ({ workspaceError }) as const,
                )
              ),
          api.getWorkoutAssignment(exec.assignmentId).then(
            (value) => ({ value }) as const,
            (assignmentError: unknown) => ({ assignmentError }) as const,
          ),
          s1.listCoachAsks({ status: "open" }).then(
            (value) => ({ value }) as const,
            (askError: unknown) => ({ askError }) as const,
          ),
          s1.listCoachAsks({ status: "answered" }).then(
            (value) => ({ value }) as const,
            (askError: unknown) => ({ askError }) as const,
          ),
        ]);
      let nextName = nameProp?.trim() || "Client";
      let nextWa: string | null = null;
      if ("meta" in workspaceRead) {
        nextName = nameProp?.trim() || formatPersonName(workspaceRead.meta.name ?? "Client");
        nextWa = workspaceRead.meta.whatsappE164;
      } else if ("ws" in workspaceRead) {
        const ws = workspaceRead.ws;
        writeClientMeta(rid, clientMetaFromWorkspaceHeader(ws.header), cacheEpoch);
        nextName = formatPersonName(ws.header.traineeDisplayName);
        nextWa = ws.header.clientWhatsappE164 ?? null;
      } else {
        reportError("sessionDetail.workspace", workspaceRead.workspaceError);
      }
      setName(nextName);
      setWhatsapp(nextWa);

      let nextAssignment: WorkoutAssignment | null = null;
      if ("value" in assignmentRead) {
        nextAssignment = assignmentRead.value;
      } else {
        reportError("sessionDetail.assignment", assignmentRead.assignmentError);
      }
      setAssignment(nextAssignment);

      const askIds = new Set<string>();
      if ("value" in openAsks && "value" in answeredAsks) {
        const related = [...openAsks.value.items, ...answeredAsks.value.items].filter(
          (ask: CoachAsk) => ask.relationshipId === rid,
        );
        for (const ask of related) {
          if (ask.itemType === "exercise_execution") {
            askIds.add(ask.itemId);
          }
          if (
            ask.itemType === "workout_assignment" &&
            ask.itemId === exec.assignmentId
          ) {
            for (const ex of exec.exercises) askIds.add(ex.id);
          }
        }
      } else {
        reportError(
          "sessionDetail.asks",
          "askError" in openAsks ? openAsks.askError : (answeredAsks as { askError: unknown }).askError,
        );
      }
      setAskExerciseIds(askIds);
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
            : "Couldn't load this workout.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [api, executionId, nameProp, ridProp, s1]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const first = name.split(" ")[0] || name;
  const tone = avatarTone(name, theme.colors);
  const profileId = ridProp || execution?.coachingRelationshipId || "";
  const openProfile =
    onOpenClient && profileId ? () => onOpenClient(profileId) : undefined;
  const status = execution ? sessionStatus(execution) : "finished";
  const noteText = execution ? sessionNoteText(execution) : null;
  const metrics = useMemo(
    () => (execution ? sessionMetrics(execution) : []),
    [execution],
  );
  const cards = useMemo(
    () =>
      execution
        ? sessionExerciseCards(execution, assignment, askExerciseIds)
        : [],
    [askExerciseIds, assignment, execution],
  );
  const changes = useMemo(
    () => (execution ? changeChips(execution) : []),
    [execution],
  );
  const earlyBanner = execution
    ? earlyFinishBanner(execution, first)
    : null;
  const subtitle =
    execution && assignment
      ? sessionSubtitle({
          dayName: assignment.workoutDayName,
          localDate: assignment.localDate,
          today,
          zone,
          execution,
        })
      : "";

  async function saveNote(input: NoteSaveInput) {
    if (!execution) return;
    setNoteActing(true);
    setNoteError(null);
    try {
      await api.createTrainerNote(
        execution.coachingRelationshipId,
        {
          body: input.body,
          visibility: input.visibility,
        },
        createIdempotencyKey(),
      );
      setNoteOpen(false);
    } catch (err) {
      reportError("sessionDetail.note", err);
      setNoteError(
        err instanceof ApiClientError
          ? err.message
          : "Could not save note. Try again.",
      );
    } finally {
      setNoteActing(false);
    }
  }

  const footer = (
    <View style={styles.footer}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setNoteOpen(true)}
        style={styles.secondaryBtn}
      >
        <NotebookPen color={theme.colors.ink} size={16} strokeWidth={2.2} />
        <Text style={styles.secondaryText}>Add note</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          void openContextualWhatsApp({
            phoneE164: whatsapp,
            draftText: `Hi ${first}, about your workout…`,
          })
        }
        style={styles.primaryBtn}
      >
        <Text style={styles.primaryText}>Reply on WhatsApp</Text>
      </Pressable>
    </View>
  );

  return (
    <Screen
      v3
      title="Workout"
      chrome="app"
      showHeader={false}
      footer={footer}
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
          Workout
        </Text>
        <View style={styles.navBtn} />
      </View>

      {offline ? (
        <ErrorBanner message="You're offline. Reconnect to load this workout." />
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}

      {loading && !execution ? (
        <View style={styles.skelCard}>
          <View style={styles.skel} />
          <View style={styles.skel} />
        </View>
      ) : execution ? (
        <>
          <View style={styles.who}>
            <ClientAvatar
              name={name}
              size={48}
              fontSize={15}
              fontWeight="700"
              tone={tone}
              onPress={openProfile}
            />
            <View style={styles.whoBody}>
              <ClientNameLink
                name={name}
                style={styles.name}
                onPress={openProfile}
              >
                {name}
              </ClientNameLink>
              {subtitle ? <Text style={styles.meta}>{subtitle}</Text> : null}
              <View style={styles.chips}>
                <View
                  style={[
                    styles.chip,
                    status === "finished_early"
                      ? styles.chipWarn
                      : styles.chipDone,
                  ]}
                >
                  {status === "finished_early" ? (
                    <TriangleAlert
                      color={theme.colors.warn}
                      size={12}
                      strokeWidth={2.2}
                    />
                  ) : (
                    <Check
                      color={theme.colors.done}
                      size={12}
                      strokeWidth={2.4}
                    />
                  )}
                  <Text
                    style={
                      status === "finished_early"
                        ? styles.chipWarnText
                        : styles.chipDoneText
                    }
                  >
                    {sessionStatusLabel(status)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.metrics}>
            {metrics.map((metric) => (
              <View key={metric.id} style={styles.metric}>
                <Text style={styles.metricValue}>{metric.value}</Text>
                <Text style={styles.metricLabel}>{metric.label}</Text>
              </View>
            ))}
          </View>

          {noteText ? (
            <View style={styles.card} testID="session-trainee-note">
              <Text style={styles.cardTitle}>{`Note from ${first}`}</Text>
              <Text selectable style={styles.noteBody}>
                {noteText}
              </Text>
            </View>
          ) : null}

          {earlyBanner ? (
            <View style={styles.warnBanner} accessibilityRole="summary">
              <TriangleAlert
                color={theme.colors.warn}
                size={16}
                strokeWidth={2.2}
              />
              <Text style={styles.warnText}>{earlyBanner}</Text>
            </View>
          ) : null}

          {changes.length > 0 ? (
            <View style={styles.changesBlock}>
              <Text style={styles.changesLabel}>CHANGES FROM YOUR PLAN</Text>
              <View style={styles.changeChips}>
                {changes.map((row) => (
                  <View key={row.id} style={styles.changeChip}>
                    <Eye
                      color={theme.colors.ink2}
                      size={12}
                      strokeWidth={2.2}
                    />
                    <Text style={styles.changeChipText}>
                      {changeChipLabel(row)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {cards.map((card) => (
            <View key={card.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.cardTitle}>{card.name}</Text>
                  {card.plan ? (
                    <Text style={styles.cardPlan}>{card.plan}</Text>
                  ) : null}
                </View>
                {card.askedYou ? (
                  <View style={styles.askedChip}>
                    <HeartPulse
                      color={theme.colors.crit}
                      size={12}
                      strokeWidth={2.2}
                    />
                    <Text style={styles.askedChipText}>Asked you</Text>
                  </View>
                ) : null}
                {card.skippedAll ? (
                  <View style={styles.skippedChip}>
                    <Eye
                      color={theme.colors.ink2}
                      size={12}
                      strokeWidth={2.2}
                    />
                    <Text style={styles.skippedChipText}>Skipped</Text>
                  </View>
                ) : null}
              </View>
              {card.skippedAll ? (
                <Text style={styles.skippedAll}>{card.skippedAllLabel}</Text>
              ) : (
                <>
                  <View style={styles.setHead}>
                    <Text style={[styles.setHeadCell, styles.setCol]}>SET</Text>
                    <Text style={[styles.setHeadCell, styles.kgCol]}>KG</Text>
                    <Text style={[styles.setHeadCell, styles.repsCol]}>
                      REPS
                    </Text>
                  </View>
                  {card.sets.map((set) => (
                    <View key={set.order} style={styles.setRow}>
                      <Text style={[styles.setCell, styles.setCol]}>
                        {set.order}
                      </Text>
                      <Text style={[styles.setCell, styles.kgCol]}>
                        {set.kg}
                      </Text>
                      <View style={[styles.repsCol, styles.repsCell]}>
                        <Text
                          style={[
                            styles.setCell,
                            set.skipped ? styles.skippedText : null,
                          ]}
                        >
                          {set.reps}
                        </Text>
                        {set.added ? (
                          <View style={styles.addedBadge}>
                            <Text style={styles.addedText}>Added</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </>
              )}
            </View>
          ))}
        </>
      ) : null}

      <NoteSheet
        visible={noteOpen}
        traineeDisplayName={name}
        acting={noteActing}
        errorMessage={noteError}
        onDismiss={() => {
          setNoteOpen(false);
          setNoteError(null);
        }}
        onSave={(input) => void saveNote(input)}
      />
    </Screen>
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
  chipDone: { backgroundColor: t.colors.doneTint },
  chipDoneText: {
    color: t.colors.done,
    fontSize: 12,
    fontWeight: "600",
  },
  chipWarn: { backgroundColor: t.colors.warnTint },
  chipWarnText: {
    color: t.colors.warnInk,
    fontSize: 12,
    fontWeight: "600",
  },
  metrics: {
    flexDirection: "row",
    marginBottom: 14,
  },
  metric: { alignItems: "center", flex: 1 },
  metricValue: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
    fontWeight: "700",
  },
  metricLabel: {
    color: t.colors.ink3,
    fontSize: 12,
    marginTop: 2,
  },
  warnBanner: {
    alignItems: "flex-start",
    backgroundColor: t.colors.warnTint,
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  warnText: {
    color: t.colors.warnInk,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  changesBlock: { marginBottom: 12 },
  changesLabel: {
    color: t.colors.ink3,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  changeChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  changeChip: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  changeChipText: {
    color: t.colors.ink,
    fontSize: 12,
    fontWeight: "600",
  },
  card: {
    backgroundColor: t.colors.card,
    borderRadius: 16,
    marginBottom: 12,
    padding: 14,
  },
  cardTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  cardTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
    fontWeight: "700",
  },
  noteBody: {
    color: t.colors.ink,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 6,
  },
  cardPlan: {
    color: t.colors.ink3,
    fontSize: 13,
    marginTop: 2,
  },
  askedChip: {
    alignItems: "center",
    backgroundColor: t.colors.critTint,
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  askedChipText: {
    color: t.colors.crit,
    fontSize: 11,
    fontWeight: "600",
  },
  skippedChip: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  skippedChipText: {
    color: t.colors.ink2,
    fontSize: 11,
    fontWeight: "600",
  },
  skippedAll: {
    color: t.colors.ink3,
    fontSize: 14,
    paddingVertical: 4,
  },
  setHead: {
    flexDirection: "row",
    marginBottom: 4,
  },
  setHeadCell: {
    color: t.colors.ink4,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  setRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 36,
  },
  setCell: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
    fontWeight: "600",
  },
  setCol: { width: 44 },
  kgCol: { flex: 1 },
  repsCol: { flex: 1.2 },
  repsCell: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  skippedText: {
    color: t.colors.ink3,
    fontFamily: undefined,
    fontWeight: "500",
  },
  addedBadge: {
    backgroundColor: t.colors.brandTint,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  addedText: {
    color: t.colors.brand,
    fontSize: 11,
    fontWeight: "700",
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
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14,
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
    flex: 1,
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
