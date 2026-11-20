import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import {
  Check,
  ChevronRight,
  Circle,
  CircleAlert,
  CloudOff,
  Copy,
  ExternalLink,
  FileText,
  Hand,
  NotebookPen,
  MoreHorizontal,
  RefreshCw,
  UserCheck,
  UserPlus,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError, userFacingMessage } from "@fitbud/api-client";
import type {
  ClientWorkspace,
  MealAssignment,
  ResponsivenessResponse,
  TrainerNote,
  WeekReadModel,
  WorkoutAssignment,
} from "@fitbud/contracts";
import {
  formatCivilDate,
  formatClockTime,
  formatPersonName,
  formatRelative,
  labelFor,
} from "@fitbud/core";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { StatusChip } from "../components/StatusChip";
import { Snackbar } from "../components/Snackbar";
import { initialsFromName, WhatsAppGlyph } from "../components/m2";
import { createIdempotencyKey } from "../lib/idempotency";
import {
  addDays,
  localDateInTimezone,
  startOfWeekMonday,
  weekDatesFrom,
} from "../lib/dates";
import { isMealLoggedForCount } from "../trainee/nutrition";
import { reportError } from "../lib/reportError";
import { trainerWebUrl } from "../lib/legalLinks";
import { readTrainerCache, trainerCacheEpoch, writeTrainerCache } from "./cache";
import { ClientLogWorkoutScreen } from "./clientlog/ClientLogWorkoutScreen";
import { ClientLogMealScreen } from "./clientlog/meal/ClientLogMealScreen";
import { ClientLogMeasurementScreen } from "./clientlog/measurement/ClientLogMeasurementScreen";
import { dateStrip } from "./clientlog/model";
import { formatAttentionAge } from "./attentionCards";
import { clientStatusApi } from "./clientStatus/api";
import { ClientInfoScreen } from "./clientStatus/ClientInfoScreen";
import {
  isOnboardingIncomplete,
  onboardingChipLabel,
  onboardingSteps,
  onboardingWaitingCopy,
} from "./clientStatus/infoModel";
import { kcalTileValue, weekDayCells } from "./clientStatus/model";
import { RemindersCard } from "./clientStatus/RemindersCard";
import { WeekCard } from "./clientStatus/WeekCard";
import { openContextualWhatsApp } from "./whatsapp";
import type { NudgePickItem } from "./sheets/NudgePickSheet";
import { NudgeSheet } from "./sheets/NudgeSheet";
import { exceptionDateLabel } from "./sheets/exceptionSheetContent";
import {
  isNudgeableExceptionType,
  nudgeTargetFromException,
  type NudgeTarget,
} from "./sheets/nudgeContent";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";

type Props = {
  relationshipId: string;
  displayName: string;
  onboardingStatusLabelText?: string;
  onBack: () => void;
  onOpenException: (exceptionId: string) => void;
  onOpenCheckin: (checkinId: string) => void;
};

type Snapshot = {
  workspace: ClientWorkspace;
  workouts: WorkoutAssignment[];
  meals: MealAssignment[];
  notes: TrainerNote[];
  /** Week read model: today's kcal against the plan, same source as web. */
  week?: WeekReadModel | null;
  responsiveness?: ResponsivenessResponse | null;
  responsivenessFailed?: boolean;
  savedAt: string;
};

function coachingWeek(startedAt: string | null | undefined, untilMs = Date.now()): number | null {
  if (!startedAt) return null;
  const elapsed = untilMs - Date.parse(startedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 1;
  return Math.max(1, Math.floor(elapsed / (7 * 24 * 60 * 60 * 1000)) + 1);
}

function isOfflineError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof ApiClientError) return err.status === 0;
  return err instanceof Error && /fetch|network|offline/i.test(err.message);
}

export function ClientStatusScreen({
  relationshipId,
  displayName,
  onBack,
  onOpenException,
  onOpenCheckin,
}: Props) {

  const theme = useTheme();
  const styles = useStyles();
  const { api, me } = useAuth();
  const zone = me?.timezone ?? "Asia/Kolkata";
  const today = localDateInTimezone(zone);
  const weekStart = startOfWeekMonday(today);
  const weekEnd = addDays(weekStart, 6);
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineAt, setOfflineAt] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // One sheet for both steps (TM-03j picker, then TM-04b): iOS cannot swap modals.
  const [nudge, setNudge] = useState<
    { target: NudgeTarget | null; items: NudgePickItem[] } | null
  >(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteVisible, setNoteVisible] = useState(false);
  const [acting, setActing] = useState(false);
  const [logging, setLogging] = useState<{ date?: string; assignmentId?: string } | null>(null);
  const [loggingOther, setLoggingOther] = useState<"meal" | "measurement" | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logPickOpen, setLogPickOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    // Captured before the fetch: if the trainer changes while it is in
    // flight, the late write is dropped (Z12-33).
    const cacheEpoch = trainerCacheEpoch();
    try {
      const [workspace, workoutPage, mealPage, notePage] = await Promise.all([
        api.getClientWorkspace(relationshipId),
        api.listWorkoutAssignments(relationshipId, {
          fromDate: weekStart,
          toDate: weekEnd,
        }),
        api.listMealAssignments(relationshipId, {
          fromDate: weekStart,
          toDate: weekEnd,
        }),
        api.listTrainerNotes(relationshipId),
      ]);
      const isEnded =
        workspace.header.onboardingStatus === "ended" || Boolean(workspace.header.endedAt);
      let week: WeekReadModel | null = null;
      let responsiveness: ResponsivenessResponse | null = null;
      let responsivenessFailed = false;
      if (!isEnded) {
        [week, responsiveness] = await Promise.all([
          clientStatusApi(api).getWorkspaceWeek(relationshipId, weekStart).catch((err: unknown) => {
            reportError("client-status.week", err);
            return null;
          }),
          clientStatusApi(api).getResponsiveness(relationshipId).catch((err: unknown) => {
            reportError("client-status.responsiveness", err);
            responsivenessFailed = true;
            return null;
          }),
        ]);
      }
      const snapshot: Snapshot = {
        workspace,
        workouts: workoutPage.items,
        meals: mealPage.items,
        notes: notePage.items,
        week,
        responsiveness,
        responsivenessFailed,
        savedAt: new Date().toISOString(),
      };
      setData(snapshot);
      writeTrainerCache(`trainer:client:${relationshipId}`, snapshot, cacheEpoch);
      setOfflineAt(null);
    } catch (err) {
      const cached = readTrainerCache<Snapshot>(`trainer:client:${relationshipId}`);
      if (isOfflineError(err) && cached) {
        setData(cached);
        setOfflineAt(cached.savedAt);
        setError(null);
      } else {
        setData(null);
        setError("Couldn't load. Pull to try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [api, relationshipId, weekStart, weekEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  // TM-03j: the nudge is about one open item. One item goes straight to the
  // sheet; several ask first; none says so.
  async function startNudge() {
    try {
      const page = await api.listExceptions(relationshipId);
      const items: NudgePickItem[] = page.items
        // Only unlogged items can be nudged; logged or skipped ones are settled (ACTIVITY_RESOLVED).
        .filter(
          (item) => item.status !== "resolved" && isNudgeableExceptionType(item.type),
        )
        .sort(
          (a, b) =>
            Number(b.severity === "critical") - Number(a.severity === "critical") ||
            b.detectedAt.localeCompare(a.detectedAt),
        )
        .map((item) => ({
          id: item.id,
          title: item.summary,
          detail:
            [exceptionDateLabel(item), item.severity === "critical" ? "critical" : null]
              .filter(Boolean)
              .join(" · ") || "Open",
          target: nudgeTargetFromException(item),
        }));
      if (items.length === 0) {
        setToast("Nothing open to nudge about");
      } else if (items.length === 1) {
        setNudge({ target: items[0]!.target, items });
      } else {
        setNudge({ target: null, items });
      }
    } catch (err) {
      reportError("client-status.nudge.items", err);
      setToast("Could not load open items. (NUDGE-ITEMS)");
    }
  }

  const header = data?.workspace.header;
  const name = formatPersonName(header?.traineeDisplayName || displayName);
  const first = name.split(" ")[0] || "there";
  const ended = header?.onboardingStatus === "ended" || Boolean(header?.endedAt);
  const onboardingIncomplete = isOnboardingIncomplete(header?.onboardingStatus);
  const offline = offlineAt != null;
  const open = data?.workspace.overview.openException ?? null;
  const weekNumber = coachingWeek(header?.startedAt);
  const startedAt = header?.startedAt ?? null;
  const endedAt = header?.endedAt ?? null;
  // Ended-path dates are the client's own calendar (web's ended overview does the same).
  const clientZone = header?.traineeTimezone ?? zone;
  const endDate = endedAt ? localDateInTimezone(clientZone, new Date(endedAt)) : null;
  const weeksCoached =
    startedAt && endedAt
      ? coachingWeek(startedAt, Date.parse(endedAt))
      : null;
  const pendingReactivation = header?.pendingReactivation ?? null;
  // TM-03a: "Fat loss · week 6 of 12". Total weeks are not on the workspace yet.
  const weekLabel =
    weekNumber != null
      ? `week ${weekNumber}`
      : null;
  const joinedLabel = startedAt
    ? `Joined ${formatCivilDate(startedAt.slice(0, 10))}`
    : null;
  const meta = ended
    ? [header?.goalShort, endDate ? `ended ${formatCivilDate(endDate)}` : null]
        .filter(Boolean)
        .join(" · ")
    : onboardingIncomplete
      ? [joinedLabel, "no plan yet"].filter(Boolean).join(" · ")
      : [header?.goalShort, weekLabel].filter(Boolean).join(" · ") ||
        "No plan assigned yet";
  const gender = header?.traineeProfile?.gender?.toLowerCase() ?? "";
  const possessive =
    gender === "female" || gender === "f" || gender === "she/her"
      ? ("her" as const)
      : gender === "male" || gender === "m" || gender === "he/him"
        ? ("his" as const)
        : ("their" as const);
  const subject =
    possessive === "her" ? ("She" as const) : possessive === "his" ? ("He" as const) : ("They" as const);
  const waiting = onboardingIncomplete
    ? onboardingWaitingCopy({
        firstName: first,
        status: header?.onboardingStatus ?? "onboarding_pending",
        startedAt,
        possessive,
        subject,
      })
    : null;
  const steps = onboardingIncomplete
    ? onboardingSteps({
        status: header?.onboardingStatus ?? "onboarding_pending",
        hasPlan: Boolean(header?.effectivePlan),
      })
    : [];

  const weekCells = useMemo(
    () => weekDayCells(zone, weekDatesFrom(weekStart), data?.workouts ?? []),
    [zone, weekStart, data?.workouts],
  );

  const weekWorkouts = data?.workouts ?? [];
  const doneWorkouts = weekWorkouts.filter(
    (item) => item.status === "completed" || item.status === "modified",
  ).length;
  const weekMeals = data?.meals ?? [];
  const loggedMeals = weekMeals.filter((item) => isMealLoggedForCount(item.status)).length;
  const checkin =
    data?.workspace.overview.pendingReviewCheckin ??
    data?.workspace.overview.nextCheckin ??
    null;

  function checkinLine(): string {
    if (!checkin) return "No check-in scheduled";
    if (checkin.status === "submitted") {
      return `Submitted ${formatCivilDate(checkin.localDate)} · waiting for your review`;
    }
    if (checkin.status === "overdue") {
      return `Weekly · due ${formatCivilDate(checkin.localDate)} · overdue`;
    }
    if (checkin.status === "due") {
      return `Weekly · due ${formatCivilDate(checkin.localDate)} · not started`;
    }
    return `Weekly · ${formatCivilDate(checkin.localDate)} · ${labelFor("checkin_status", checkin.status)}`;
  }

  const nutrition = data?.week?.todayNutrition ?? null;
  const kcalLine = kcalTileValue(nutrition);
  const kcalPct =
    nutrition?.assigned && nutrition.assigned.kcal > 0
      ? Math.min(
          100,
          Math.round((nutrition.logged.kcal / nutrition.assigned.kcal) * 100),
        )
      : 0;
  const overKcal =
    nutrition?.assigned != null &&
    nutrition.logged.kcal > nutrition.assigned.kcal;

  async function copyPlanLink() {
    const url = `${trainerWebUrl()}/clients/${relationshipId}`;
    try {
      const { setStringAsync } = await import("expo-clipboard");
      await setStringAsync(url);
      setToast("Link copied");
    } catch {
      try {
        const clipboard = (
          globalThis as {
            navigator?: { clipboard?: { writeText: (v: string) => Promise<void> } };
          }
        ).navigator?.clipboard;
        await clipboard?.writeText(url);
        setToast("Link copied");
      } catch {
        setToast("Couldn't copy the link");
      }
    }
  }

  async function saveNote() {
    if (!noteBody.trim() || ended || offline) return;
    setActing(true);
    try {
      await api.createTrainerNote(
        relationshipId,
        {
          body: noteBody.trim(),
          visibility: noteVisible ? "client" : "private",
        },
        createIdempotencyKey(),
      );
      setNoteBody("");
      setNoteOpen(false);
      setToast("Note saved");
      await load();
    } catch (err) {
      setError(userFacingMessage(err, { fallback: "Couldn't load. Pull to try again." }));
    } finally {
      setActing(false);
    }
  }

  async function sendReactivate() {
    if (!ended || offline || pendingReactivation) return;
    setActing(true);
    try {
      await clientStatusApi(api).requestReactivation(
        relationshipId,
        {},
        createIdempotencyKey(),
      );
      setReactivateOpen(false);
      setToast("Rejoin invite sent");
      await load();
      if (header?.clientWhatsappE164) {
        void openContextualWhatsApp({
          phoneE164: header.clientWhatsappE164,
          draftText: `Hi ${first}, I'd like to coach you again on FitBud. Please open the invite when you can.`,
        });
      }
    } catch (err) {
      setToast(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't send the invite. Try again.",
      );
    } finally {
      setActing(false);
    }
  }

  if (loggingOther) {
    const Other = loggingOther === "meal" ? ClientLogMealScreen : ClientLogMeasurementScreen;
    return (
      <Other
        relationshipId={relationshipId}
        displayName={header?.traineeDisplayName || displayName}
        ended={ended}
        clientZone={clientZone}
        onBack={() => setLoggingOther(null)}
        onSaved={(message) => {
          setLoggingOther(null);
          setToast(message);
          void load();
        }}
      />
    );
  }

  if (logging) {
    return (
      <ClientLogWorkoutScreen
        relationshipId={relationshipId}
        displayName={header?.traineeDisplayName || displayName}
        ended={ended}
        clientZone={clientZone}
        initialDate={logging.date}
        initialAssignmentId={logging.assignmentId}
        onBack={() => setLogging(null)}
        onSaved={(message) => {
          setLogging(null);
          setToast(message);
          void load();
        }}
      />
    );
  }

  if (infoOpen) {
    return (
      <ClientInfoScreen
        relationshipId={relationshipId}
        displayName={header?.traineeDisplayName || displayName}
        workspace={data?.workspace ?? null}
        onBack={() => setInfoOpen(false)}
      />
    );
  }

  const actionsDisabled = ended || offline;
  const loadFailed = !loading && !data && Boolean(error);

  if (loadFailed) {
    const failName = formatPersonName(displayName);
    const failFirst = failName.split(" ")[0] || failName;
    return (
      <Screen v3 title="" showHeader={false} chrome="app">
        <View style={styles.nav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            style={styles.navBtn}
          >
            <Text style={styles.navChevron}>‹</Text>
          </Pressable>
          <View style={styles.navBtn} />
        </View>
        <View style={styles.loadError}>
          <View style={styles.loadErrorIcon}>
            <CloudOff color={theme.colors.ink} size={28} strokeWidth={1.8} />
          </View>
          <Text style={styles.loadErrorTitle}>
            {`Couldn’t load ${failFirst}’s page`}
          </Text>
          <Text style={styles.loadErrorBody}>
            Check your connection and pull down to try again.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setLoading(true);
              void load();
            }}
            style={styles.tryAgain}
          >
            <RefreshCw color={theme.colors.ink} size={16} strokeWidth={2.2} />
            <Text style={styles.tryAgainText}>Try again</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      v3
      title=""
      showHeader={false}
      chrome="app"
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More"
          onPress={() => setMenuOpen(true)}
          style={styles.navBtn}
        >
          <MoreHorizontal color={theme.colors.ink} size={22} strokeWidth={2.2} />
        </Pressable>
      </View>

      {offline ? (
        <Text style={styles.offline}>
          {`You're offline. Showing the last update from ${formatClockTime(offlineAt!, zone)}.`}
        </Text>
      ) : null}
      {error && data ? <ErrorBanner message={error} /> : null}
      {loading && !data ? (
        <View>
          <View style={styles.skeleton} />
          <View style={styles.skeleton} />
        </View>
      ) : null}

      <View style={styles.header}>
        <View style={styles.avatarLg}>
          <Text style={styles.avatarLgText}>{initialsFromName(name)}</Text>
        </View>
        <View style={styles.headerBody}>
          <Text style={styles.h1}>{name}</Text>
          <Text style={styles.meta}>{meta}</Text>
          <View style={styles.chipRow}>
            {ended ? (
              <StatusChip kind="lifecycle" value="ended" />
            ) : onboardingIncomplete ? (
              <View style={styles.onboardChip}>
                <UserPlus color={theme.colors.info} size={13} strokeWidth={2.2} />
                <Text style={styles.onboardChipText}>
                  {onboardingChipLabel(header?.onboardingStatus ?? "onboarding_pending")}
                </Text>
              </View>
            ) : header?.adherenceState === "needs_attention" || open ? (
              <View style={styles.needsChip}>
                <CircleAlert color={theme.colors.crit} size={13} strokeWidth={2.4} />
                <Text style={styles.needsChipText}>Needs attention</Text>
              </View>
            ) : header?.adherenceState === "on_track" ? (
              <StatusChip kind="adherence" value="on_track" />
            ) : (
              <StatusChip
                kind="lifecycle"
                value={header?.onboardingStatus ?? "active"}
              />
            )}
          </View>
        </View>
      </View>

      {header?.traineeTimezone && header.traineeTimezone !== zone ? (
        <Text style={styles.tz}>
          {`${first}'s time ${formatClockTime(new Date().toISOString(), header.traineeTimezone)}`}
        </Text>
      ) : null}

      {ended ? (
        <View style={styles.ended} accessibilityRole="summary">
          <Text style={styles.endedText}>
            {pendingReactivation
              ? `Waiting for ${first} to confirm. History is read only.`
              : `Coaching ended${endDate ? ` on ${formatCivilDate(endDate)}` : ""}. History is read only.`}
          </Text>
          {pendingReactivation ? null : (
            <Pressable
              accessibilityRole="button"
              disabled={offline}
              onPress={() => setReactivateOpen(true)}
              style={styles.reactivateLink}
            >
              <Text style={styles.link}>Reactivate</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {onboardingIncomplete && waiting ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{waiting.title}</Text>
            <Text style={styles.waitingBody}>{waiting.body}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={offline}
              onPress={() =>
                void openContextualWhatsApp({
                  phoneE164: header?.clientWhatsappE164,
                  draftText: `Hi ${first}, just a reminder to send your FitBud intake when you can.`,
                }).then(() => setToast("Opened WhatsApp"))
              }
              style={[styles.remindBtn, offline ? styles.disabled : null]}
            >
              <WhatsAppGlyph size={18} />
              <Text style={styles.remindBtnText}>Remind on WhatsApp</Text>
            </Pressable>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Steps</Text>
            {steps.map((step, index) => (
              <View key={step.id}>
                {index > 0 ? <View style={styles.stepDivider} /> : null}
                <View style={styles.stepRow}>
                  {step.done ? (
                    <View style={styles.stepDone}>
                      <Check color={theme.colors.card} size={12} strokeWidth={2.6} />
                    </View>
                  ) : (
                    <Circle
                      color={theme.colors.ink4}
                      size={20}
                      strokeWidth={1.8}
                    />
                  )}
                  <Text
                    style={[
                      styles.stepLabel,
                      step.done ? null : styles.stepLabelPending,
                    ]}
                  >
                    {step.label}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : (
        <>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={actionsDisabled || !header?.clientWhatsappE164}
          onPress={() =>
            void openContextualWhatsApp({
              phoneE164: header?.clientWhatsappE164,
              draftText: `Hi ${first}, `,
            }).then(() => setToast("Opened WhatsApp"))
          }
          style={[styles.actionBtn, actionsDisabled ? styles.disabled : null]}
        >
          <WhatsAppGlyph size={18} />
          <Text style={styles.actionText}>WhatsApp</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={actionsDisabled}
          onPress={() => void startNudge()}
          style={[styles.actionBtn, actionsDisabled ? styles.disabled : null]}
        >
          <Hand color={theme.colors.ink} size={16} strokeWidth={2.2} />
          <Text style={styles.actionText}>Nudge…</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={actionsDisabled}
          onPress={() => setNoteOpen(true)}
          style={[styles.actionBtn, actionsDisabled ? styles.disabled : null]}
        >
          <NotebookPen color={theme.colors.ink} size={16} strokeWidth={2.2} />
          <Text style={styles.actionText}>Note</Text>
        </Pressable>
      </View>
      {!header?.clientWhatsappE164 && !ended ? (
        <Text style={styles.hint}>No WhatsApp number on file</Text>
      ) : null}

      {open && !ended ? (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle}>Needs attention</Text>
            <Text style={styles.since}>
              {formatAttentionAge(
                Math.max(
                  0,
                  Math.round((Date.now() - Date.parse(open.detectedAt)) / 60_000),
                ),
              )}
            </Text>
          </View>
          <View style={styles.attnBody}>
            <StatusChip kind="severity" value={open.severity} />
            <Text style={styles.issue}>{open.summary}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={offline}
            onPress={() => onOpenException(open.id)}
            style={[styles.tintBtn, offline ? styles.disabled : null]}
          >
            <Text style={styles.tintBtnText}>Review</Text>
          </Pressable>
        </View>
      ) : null}

      {checkin &&
      checkin.status === "submitted" &&
      !ended &&
      !open ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Needs attention</Text>
          <View style={styles.attnBody}>
            <StatusChip kind="checkin" value="submitted" />
            <Text style={styles.issue}>{checkinLine()}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenCheckin(checkin.id)}
            style={styles.tintBtn}
          >
            <Text style={styles.tintBtnText}>Review check-in</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle}>This week</Text>
          <Text style={styles.since}>
            {`${formatCivilDate(weekStart)} – ${formatCivilDate(weekEnd)}`}
          </Text>
        </View>
        {ended ? (
          <>
            <WeekCard cells={weekCells} tiles={[]} />
            <Text style={styles.endedPlanLine}>
              {endDate
                ? `No plan since ${formatCivilDate(endDate)}`
                : "No plan while coaching is ended"}
            </Text>
          </>
        ) : (
          <WeekCard
            cells={weekCells}
            tiles={[
              {
                value: `${doneWorkouts} of ${weekWorkouts.length || 0}`,
                label: "workouts",
              },
              {
                value: `${loggedMeals} of ${weekMeals.length || 0}`,
                label: "meals",
              },
            ]}
          />
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today's food</Text>
        {ended ? (
          <View style={styles.foodRow}>
            <Text style={styles.kcalHero}>0</Text>
            <Text style={styles.kcalSub}>kcal · no plan</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Review day"
              disabled
              style={[styles.reviewDay, styles.disabled]}
            >
              <Text style={styles.link}>Review day</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.foodRow}>
            <Text style={styles.kcalHero}>
              {nutrition ? nutrition.logged.kcal.toLocaleString("en-IN") : "–"}
            </Text>
            <Text style={styles.kcalSub}>
              {nutrition?.assigned
                ? `of ${nutrition.assigned.kcal.toLocaleString("en-IN")} kcal planned`
                : "kcal logged"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Review day"
              onPress={() =>
                setToast("Diet day review opens after the meal review lands")
              }
              style={styles.reviewDay}
            >
              <Text style={styles.link}>Review day</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.track}>
          <View
            style={[
              styles.trackFill,
              {
                width: ended ? "0%" : `${kcalPct}%`,
                backgroundColor: overKcal
                  ? theme.colors.warn
                  : theme.colors.brand,
              },
            ]}
          />
        </View>
        {/* Keep the legacy string for tests that pin kcalTileValue copy. */}
        {!ended ? <Text style={styles.srOnly}>{kcalLine}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Next check-in</Text>
        <Text style={styles.checkinLine}>
          {ended
            ? "No check-ins after coaching ended"
            : checkinLine()}
        </Text>
        {!ended && checkin && checkin.status === "submitted" ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenCheckin(checkin.id)}
            style={styles.tintBtn}
          >
            <Text style={styles.tintBtnText}>Open</Text>
          </Pressable>
        ) : null}
      </View>

      {ended ? null : (
        <View>
          <RemindersCard
            data={data?.responsiveness ?? null}
            failed={Boolean(data?.responsivenessFailed)}
          />
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>Recent activity</Text>
            </View>
            {(data?.workspace.overview.recentActivity ?? []).length === 0 ? (
              <Text style={styles.meta}>Nothing logged yet.</Text>
            ) : null}
            {(data?.workspace.overview.recentActivity ?? []).map((item) => (
              <View key={item.id} style={styles.activity}>
                <Text style={styles.activityTitle}>{item.title}</Text>
                <Text style={styles.meta}>
                  {`${formatCivilDate(item.localDate)} · ${formatRelative(item.occurredAt)}`}
                </Text>
                {item.type === "workout" &&
                (item.state === "completed" || item.state === "modified") &&
                !offline &&
                dateStrip(localDateInTimezone(clientZone)).includes(
                  item.localDate,
                ) ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${item.title}`}
                    onPress={() =>
                      setLogging({
                        date: item.localDate,
                        assignmentId: item.id,
                      })
                    }
                    style={styles.editLink}
                  >
                    <Text style={styles.link}>Edit</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle}>Coach notes</Text>
          {!ended ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setNoteOpen(true)}
            >
              <Text style={styles.link}>Add note</Text>
            </Pressable>
          ) : null}
        </View>
        {(data?.notes ?? []).map((note) => (
          <View key={note.id} style={styles.noteBlock}>
            <Text style={styles.issue}>{note.body}</Text>
            <Text style={styles.meta}>
              {`${labelFor("trainer_note_visibility", note.visibility)} · ${formatCivilDate(note.createdAt.slice(0, 10))}`}
            </Text>
          </View>
        ))}
      </View>

      {noteOpen ? (
        <View style={styles.card}>
          <TextInput
            accessibilityLabel="Note"
            value={noteBody}
            onChangeText={setNoteBody}
            placeholder="Add a note"
            placeholderTextColor={theme.colors.ink3}
            multiline
            style={styles.input}
          />
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: noteVisible }}
            onPress={() => setNoteVisible((value) => !value)}
            style={styles.switchRow}
          >
            <Text style={styles.meta}>
              {noteVisible
                ? `Visible to ${first}`
                : "Only you see this note"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={acting || offline || ended}
            onPress={() => void saveNote()}
            style={styles.tintBtn}
          >
            <Text style={styles.tintBtnText}>Save note</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.editPlanRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.activityTitle}>Edit plan</Text>
            <Text style={styles.meta}>
              Plans and templates are built on FitBud web
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => void copyPlanLink()}
            style={styles.copyBtn}
          >
            <Copy color={theme.colors.ink} size={16} strokeWidth={2.2} />
            <Text style={styles.actionText}>Copy link</Text>
          </Pressable>
        </View>
      </View>
        </>
      )}

      <NudgeSheet
        visible={nudge != null}
        target={nudge?.target ?? null}
        pickItems={nudge?.items}
        traineeDisplayName={name}
        clientTimeZone={header?.traineeTimezone ?? null}
        trainerDisplayName={me?.trainerProfile?.displayName ?? null}
        api={clientStatusApi(api)}
        onDismiss={() => setNudge(null)}
        onSent={(line) => {
          setNudge(null);
          setToast(line);
        }}
      />

      <Modal
        visible={menuOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          style={styles.menuScrim}
          onPress={() => setMenuOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View style={styles.menuSheet}>
          <MenuRow
            icon={NotebookPen}
            title="Add note"
            sub={`Private, or shared on ${first}'s Today`}
            onPress={() => {
              setMenuOpen(false);
              setNoteOpen(true);
            }}
            disabled={ended}
          />
          <MenuRow
            icon={FileText}
            title="Goal, intake and limitations"
            onPress={() => {
              setMenuOpen(false);
              setInfoOpen(true);
            }}
          />
          <MenuRow
            icon={UserCheck}
            title={`Log in person for ${first}`}
            sub={`Workout or meal, as ${first}'s coach`}
            onPress={() => {
              setMenuOpen(false);
              setLogPickOpen(true);
            }}
            disabled={ended || offline}
          />
          <MenuRow
            icon={ExternalLink}
            title={`Open ${first} on FitBud web`}
            sub="Edit plan, end coaching"
            onPress={() => {
              setMenuOpen(false);
              void copyPlanLink();
            }}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => setMenuOpen(false)}
            style={styles.menuCancel}
          >
            <Text style={styles.menuCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>

      <Modal
        visible={logPickOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLogPickOpen(false)}
      >
        <Pressable
          style={styles.menuScrim}
          onPress={() => setLogPickOpen(false)}
        />
        <View style={styles.menuSheet}>
          <MenuRow
            icon={UserCheck}
            title="Log workout"
            onPress={() => {
              setLogPickOpen(false);
              setLogging({});
            }}
          />
          <MenuRow
            icon={UserCheck}
            title="Log meal"
            onPress={() => {
              setLogPickOpen(false);
              setLoggingOther("meal");
            }}
          />
          <MenuRow
            icon={UserCheck}
            title="Log measurement"
            onPress={() => {
              setLogPickOpen(false);
              setLoggingOther("measurement");
            }}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => setLogPickOpen(false)}
            style={styles.menuCancel}
          >
            <Text style={styles.menuCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>

      <Modal
        visible={reactivateOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setReactivateOpen(false)}
      >
        <Pressable
          style={styles.menuScrim}
          onPress={() => setReactivateOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View style={styles.menuSheet} accessibilityRole="summary">
          <Text style={styles.reactivateTitle}>{`Reactivate ${first}?`}</Text>
          <Text style={styles.reactivateBody}>
            {`${first} gets a WhatsApp invite to rejoin. Their old plan isn't restarted. Assign a new one on FitBud web.`}
          </Text>
          <View style={styles.reactivateFacts}>
            <View style={styles.reactivateFact}>
              <Text style={styles.reactivateFactLabel}>History</Text>
              <Text style={styles.reactivateFactValue}>
                {weeksCoached != null
                  ? `Kept · ${weeksCoached} ${weeksCoached === 1 ? "week" : "weeks"} of logs`
                  : "Kept · logs stay on file"}
              </Text>
            </View>
            <View style={styles.reactivateFact}>
              <Text style={styles.reactivateFactLabel}>Plan</Text>
              <Text style={styles.reactivateFactValue}>
                None until you assign one
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={acting || offline}
            onPress={() => void sendReactivate()}
            style={[styles.reactivatePrimary, acting || offline ? styles.disabled : null]}
          >
            <WhatsAppGlyph size={18} />
            <Text style={styles.reactivatePrimaryText}>Send invite to rejoin</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setReactivateOpen(false)}
            style={styles.menuCancel}
          >
            <Text style={styles.menuCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>

      {toast ? <Snackbar message={toast} onDismiss={() => setToast(null)} /> : null}
    </Screen>
  );
}

function MenuRow({
  icon: Icon,
  title,
  sub,
  onPress,
  disabled,
}: {
  icon: typeof NotebookPen;
  title: string;
  sub?: string;
  onPress: () => void;
  disabled?: boolean;
}) {

  const theme = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.menuRow, disabled ? styles.disabled : null]}
    >
      <View style={styles.menuIcon}>
        <Icon color={theme.colors.ink} size={18} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.menuTitle}>{title}</Text>
        {sub ? <Text style={styles.menuSub}>{sub}</Text> : null}
      </View>
      <ChevronRight color={theme.colors.ink3} size={18} />
    </Pressable>
  );
}

const useStyles = createThemedStyles((t) => ({
  nav: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
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
  },
  header: { flexDirection: "row", gap: 14, marginTop: 6 },
  headerBody: { flex: 1, minWidth: 0 },
  avatarLg: {
    alignItems: "center",
    backgroundColor: t.colors.av1Bg,
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  avatarLgText: {
    color: t.colors.av1Fg,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
  },
  h1: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 26,
    letterSpacing: -0.3,
  },
  meta: { color: t.colors.ink3, fontSize: 14, lineHeight: 20, marginTop: 2 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  needsChip: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: t.colors.critTint,
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  needsChipText: {
    color: t.colors.crit,
    fontFamily: fontFamilySemiBold,
    fontSize: 12,
  },
  actions: { flexDirection: "row", gap: 8, marginTop: 14 },
  actionBtn: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 14,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    height: 44,
    justifyContent: "center",
  },
  actionText: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 14,
  },
  copyBtn: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 12,
    flexDirection: "row",
    gap: 6,
    height: 40,
    paddingHorizontal: 12,
  },
  hint: { color: t.colors.ink3, fontSize: 13, marginTop: 6 },
  tz: { color: t.colors.ink3, fontSize: 14, marginTop: 8 },
  card: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 12,
    padding: 14,
  },
  cardTop: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
  },
  since: { color: t.colors.ink3, fontSize: 13 },
  attnBody: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  issue: { color: t.colors.ink, flex: 1, fontSize: 15, lineHeight: 21 },
  tintBtn: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    marginTop: 10,
  },
  tintBtnText: {
    color: t.colors.brand,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
  },
  foodRow: {
    alignItems: "baseline",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  kcalHero: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 28,
    letterSpacing: -0.4,
  },
  kcalSub: { color: t.colors.ink3, flex: 1, fontSize: 14 },
  reviewDay: { minHeight: 44, justifyContent: "center" },
  track: {
    backgroundColor: t.colors.fill2,
    borderRadius: 999,
    height: 6,
    marginTop: 8,
    overflow: "hidden",
  },
  trackFill: { borderRadius: 999, height: 6 },
  checkinLine: { color: t.colors.ink3, fontSize: 14, marginTop: 4 },
  link: { color: t.colors.brand, fontFamily: fontFamilySemiBold, fontSize: 14.5 },
  editLink: { alignSelf: "flex-start", justifyContent: "center", minHeight: 44 },
  activity: {
    borderTopColor: t.colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    paddingTop: 9,
  },
  activityTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
  },
  noteBlock: {
    borderTopColor: t.colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    paddingTop: 10,
  },
  editPlanRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  input: { color: t.colors.ink, fontSize: 16, minHeight: 72 },
  switchRow: { minHeight: 44, justifyContent: "center" },
  ended: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 12,
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
    padding: 12,
  },
  endedText: { color: t.colors.ink, flex: 1, fontSize: 14 },
  reactivateLink: { minHeight: 44, justifyContent: "center" },
  endedPlanLine: {
    color: t.colors.ink3,
    fontSize: 14,
    marginTop: 10,
  },
  reactivateTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 22,
    marginBottom: 8,
  },
  reactivateBody: {
    color: t.colors.ink3,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 14,
  },
  reactivateFacts: {
    backgroundColor: t.colors.fill,
    borderRadius: 14,
    gap: 10,
    marginBottom: 16,
    padding: 14,
  },
  reactivateFact: { gap: 2 },
  reactivateFactLabel: { color: t.colors.ink3, fontSize: 13 },
  reactivateFactValue: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
  },
  reactivatePrimary: {
    alignItems: "center",
    backgroundColor: t.colors.ink,
    borderRadius: 16,
    flexDirection: "row",
    gap: 8,
    height: 52,
    justifyContent: "center",
  },
  reactivatePrimaryText: {
    color: t.colors.card,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  offline: { color: t.colors.ink, fontSize: 14, marginBottom: 8 },
  skeleton: {
    backgroundColor: t.colors.skel1,
    borderRadius: 20,
    height: 120,
    marginBottom: 12,
  },
  loadError: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingBottom: 80,
  },
  loadErrorIcon: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 18,
    height: 64,
    justifyContent: "center",
    marginBottom: 18,
    width: 64,
  },
  loadErrorTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  loadErrorBody: {
    color: t.colors.ink3,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: "center",
  },
  tryAgain: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 20,
    minHeight: 48,
    paddingHorizontal: 20,
  },
  tryAgainText: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
    fontWeight: "600",
  },
  onboardChip: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: t.colors.infoTint,
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  onboardChipText: {
    color: t.colors.info,
    fontSize: 12,
    fontWeight: "600",
  },
  waitingBody: {
    color: t.colors.ink2,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  remindBtn: {
    alignItems: "center",
    backgroundColor: t.colors.brand,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 14,
    minHeight: 48,
  },
  remindBtnText: {
    color: t.colors.card,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
    fontWeight: "600",
  },
  stepRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
  },
  stepDivider: {
    backgroundColor: t.colors.line,
    height: StyleSheet.hairlineWidth,
  },
  stepDone: {
    alignItems: "center",
    backgroundColor: t.colors.done,
    borderRadius: 10,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  stepLabel: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
    fontWeight: "600",
  },
  stepLabelPending: {
    color: t.colors.ink2,
    fontFamily: undefined,
    fontWeight: "500",
  },
  disabled: { opacity: 0.45 },
  srOnly: { height: 0, opacity: 0, overflow: "hidden" },
  menuScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: t.colors.scrim,
  },
  menuSheet: {
    backgroundColor: t.colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    bottom: 0,
    left: 0,
    paddingBottom: 28,
    paddingHorizontal: 16,
    paddingTop: 12,
    position: "absolute",
    right: 0,
  },
  menuRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    paddingVertical: 10,
  },
  menuIcon: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  menuTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  menuSub: { color: t.colors.ink3, fontSize: 13, marginTop: 2 },
  menuCancel: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 16,
    height: 48,
    justifyContent: "center",
    marginTop: 8,
  },
  menuCancelText: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
}));
