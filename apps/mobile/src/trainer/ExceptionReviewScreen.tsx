import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import {
  Ban,
  Bell,
  Check,
  ChevronLeft,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  Ellipsis,
  Eye,
  Minus,
  WifiOff,
  X,
} from "lucide-react-native";
import { ApiClientError, userFacingMessage } from "@fitbud/api-client";
import type {
  ExceptionDetail,
  MealAssignment,
  WorkoutAssignment,
} from "@fitbud/contracts";
import { deviceTimeZone, formatPersonName } from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { Snackbar } from "../components/Snackbar";
import { Text } from "../components/Text";
import { initialsFromName } from "../components/m2";
import { createIdempotencyKey } from "../lib/idempotency";
import {
  addDays,
  localDateInTimezone,
  startOfWeekMonday,
  weekDatesFrom,
} from "../lib/dates";
import { plannedRowsFromAssignment } from "../lib/plannedMealItems";
import { reportError } from "../lib/reportError";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../providers/ThemeProvider";
import { formatAttentionAge } from "./attentionCards";
import { clientStatusApi } from "./clientStatus/api";
import { labelFor } from "./labels";
import {
  buildReviewSheetCardModel,
  coachingWeekNumber,
  type ReviewSheetCardModel,
} from "./reviewSheetContent";
import { MoreSheet } from "./sheets/MoreSheet";
import { NoteSheet, type NoteSaveInput } from "./sheets/NoteSheet";
import { NudgeSheet } from "./sheets/NudgeSheet";
import { ResolveSheet, type ResolveOutcome } from "./sheets/ResolveSheet";
import { isAlreadyResolved, isResolveConflict } from "./sheets/resolveRecovery";
import { firstNameOf } from "./sheets/exceptionSheetContent";
import {
  BACK_TO_NEEDS_YOU,
  NOT_FOUND_BODY,
  NOT_FOUND_TITLE,
  civilDayLine,
  endedBannerText,
  exceptionAgeMinutes,
  exceptionFooterActions,
  exceptionHeaderSubtitle,
  exceptionReviewStatus,
  exceptionStatusChipLabel,
  isNetworkFailure,
  isNotFound,
  offlineBannerText,
  resolvedBannerText,
  resolvedOutcomePhrase,
  reviewedBannerText,
  type ExceptionFooterAction,
  type ExceptionReviewStatus,
} from "./sheets/exceptionStateContent";
import { exceptionWeekModel, type ExceptionWeekModel } from "./sheets/exceptionWeek";
import {
  isNudgeableExceptionType,
  nudgeTargetFromException,
} from "./sheets/nudgeContent";
import { openContextualWhatsApp } from "./whatsapp";

type Props = {
  exceptionId: string;
  onBack: () => void;
  onOpenClient: (relationshipId: string) => void;
};

type ClientInfo = {
  name: string;
  zone: string | null;
  whatsappE164: string | null;
  goalShort: string | null;
  startedAt: string | null;
  endedAt: string | null;
};

/**
 * TM-04a, TM-04d–TM-04l: the trainer's exception review. Mark reviewed, then
 * Resolve (only the trainer resolves; the API resolves an acknowledged item),
 * Nudge as a FitBud push, and the ⋯ menu (note, WhatsApp redirect, profile).
 * Not found, offline and ended are their own states; a resolved item and an
 * ended client are read only. Follows the system theme (Z12-51).
 */
export function ExceptionReviewScreen(props: Props) {
  return (
    <ThemeScope scheme="system">
      <ExceptionReviewBody {...props} />
    </ThemeScope>
  );
}

function ExceptionReviewBody({ exceptionId, onBack, onOpenClient }: Props) {
  const { api, me } = useAuth();
  const theme = useTheme();
  const styles = useStyles();
  const trainerZone = deviceTimeZone();
  const [detail, setDetail] = useState<ExceptionDetail | null>(null);
  const [card, setCard] = useState<ReviewSheetCardModel | null>(null);
  const [week, setWeek] = useState<ExceptionWeekModel | null>(null);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // "unknown" until the client workspace answers: live actions stay hidden
  // so an ended client is never offered Mark reviewed, Resolve, Note or Nudge.
  const [coaching, setCoaching] = useState<"unknown" | "active" | "ended">(
    "unknown",
  );
  const [notFound, setNotFound] = useState(false);
  const [offline, setOffline] = useState(false);
  // The outcome the trainer just chose: the exception read does not carry it.
  const [resolvedOutcome, setResolvedOutcome] = useState<ResolveOutcome | null>(
    null,
  );
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  // One idempotency key per composer session, reused when Save is retried.
  const noteKey = useRef<string | null>(null);
  // One key per Mark reviewed / Resolve attempt, reused on a retry of the same press.
  const ackKey = useRef<string | null>(null);
  const resolveKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    let result: ExceptionDetail;
    try {
      result = await api.getException(exceptionId);
    } catch (err) {
      if (isNotFound(err)) {
        setDetail(null);
        setNotFound(true);
      } else if (isNetworkFailure(err)) {
        setOffline(true);
      } else {
        if (!(err instanceof ApiClientError)) {
          reportError("trainer.exception.load", err);
        }
        setError(
          userFacingMessage(err, { fallback: "Could not load exception. (EXC-LOAD)" }),
        );
      }
      setLoading(false);
      return;
    }
    setDetail(result);
    setOffline(false);
    let info: ClientInfo | null = null;
    try {
      const workspace = await api.getClientWorkspace(
        result.coachingRelationshipId,
      );
      info = {
        name: workspace.header.traineeDisplayName,
        zone: workspace.header.traineeTimezone ?? null,
        whatsappE164: workspace.header.clientWhatsappE164 ?? null,
        goalShort: workspace.header.goalShort ?? null,
        startedAt: workspace.header.startedAt ?? null,
        endedAt: workspace.header.endedAt ?? null,
      };
      setClient(info);
      setCoaching(info.endedAt ? "ended" : "active");
    } catch (err) {
      // Ended-ness is unknown: keep live actions hidden until a retry works.
      setCoaching("unknown");
      if (isNetworkFailure(err)) {
        setOffline(true);
      } else {
        reportError("trainer.exception.workspace", err);
        setError("Could not check the client's status. (EXC-WS)");
      }
    }
    // The card's Planned row and the week strip are context: a failed read
    // drops that row or card, never the review itself.
    let workout: WorkoutAssignment | null = null;
    let meal: MealAssignment | null = null;
    try {
      if (result.sourceEntityType === "workout_assignment") {
        workout = await api.getWorkoutAssignment(result.sourceEntityId);
      } else if (result.sourceEntityType === "meal_assignment") {
        meal = await api.getMealAssignment(result.sourceEntityId);
      }
    } catch (err) {
      if (!isNetworkFailure(err)) reportError("trainer.exception.source", err);
    }
    const mealKcalSum = meal
      ? plannedRowsFromAssignment(meal).reduce(
          (sum, row) => sum + (row.kcalPreview ?? 0),
          0,
        )
      : 0;
    setCard(
      buildReviewSheetCardModel({
        detail: result,
        ageMinutes: exceptionAgeMinutes(result),
        workout,
        meal,
        mealKcal: mealKcalSum > 0 ? mealKcalSum : null,
        timeZone: info?.zone ?? undefined,
      }),
    );
    if (info && !info.endedAt && result.status !== "resolved") {
      const zone = info.zone ?? trainerZone;
      const today = localDateInTimezone(zone);
      const start = startOfWeekMonday(today);
      const end = addDays(start, 6);
      try {
        const [workouts, meals] = await Promise.all([
          api.listWorkoutAssignments(result.coachingRelationshipId, {
            fromDate: start,
            toDate: end,
          }),
          api.listMealAssignments(result.coachingRelationshipId, {
            fromDate: start,
            toDate: end,
          }),
        ]);
        setWeek(
          exceptionWeekModel({
            dates: weekDatesFrom(start),
            today,
            workouts: workouts.items,
            meals: meals.items,
          }),
        );
      } catch (err) {
        setWeek(null);
        if (!isNetworkFailure(err)) reportError("trainer.exception.week", err);
      }
    } else {
      setWeek(null);
    }
    setLoading(false);
  }, [api, exceptionId, trainerZone]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markReviewed() {
    setActing(true);
    setError(null);
    ackKey.current ??= createIdempotencyKey();
    try {
      await api.acknowledgeException(exceptionId, {}, ackKey.current);
      ackKey.current = null;
      await load();
    } catch (err) {
      if (isNetworkFailure(err)) {
        setOffline(true);
      } else {
        if (!(err instanceof ApiClientError)) {
          reportError("trainer.exception.acknowledge", err);
        }
        setError(
          userFacingMessage(err, { fallback: "Could not mark reviewed. (ACK-ERR)" }),
        );
      }
    } finally {
      setActing(false);
    }
  }

  async function resolve(input: {
    outcome: ResolveOutcome | null;
    note: string | null;
  }) {
    setActing(true);
    setError(null);
    setResolveError(null);
    resolveKey.current ??= createIdempotencyKey();
    try {
      await api.resolveException(
        exceptionId,
        {
          note: input.note,
          interventionKind: "resolve",
          ...(input.outcome ? { outcome: input.outcome } : {}),
        },
        resolveKey.current,
      );
      resolveKey.current = null;
      setResolvedOutcome(input.outcome);
      setResolveOpen(false);
      await load();
    } catch (err) {
      if (isNetworkFailure(err)) {
        setResolveOpen(false);
        setOffline(true);
      } else if (
        isResolveConflict(err) &&
        (await isAlreadyResolved((id) => api.getException(id), exceptionId))
      ) {
        // A lost success: the item is resolved, so this is success, not an error.
        resolveKey.current = null;
        setResolvedOutcome(input.outcome);
        setResolveOpen(false);
        await load();
      } else {
        if (!(err instanceof ApiClientError)) {
          reportError("trainer.exception.resolve", err);
        }
        setResolveError(
          userFacingMessage(err, { fallback: "Could not resolve. (RES-ERR)" }),
        );
      }
    } finally {
      setActing(false);
    }
  }

  async function saveNote(input: NoteSaveInput) {
    if (!detail) return;
    setActing(true);
    setNoteError(null);
    noteKey.current ??= createIdempotencyKey();
    try {
      await api.createTrainerNote(
        detail.coachingRelationshipId,
        input,
        noteKey.current,
      );
      noteKey.current = null;
      setNoteOpen(false);
      setToast(
        input.visibility === "client"
          ? `Shown on ${firstNameOf(client?.name) || "your client"}'s Today`
          : "Saved privately",
      );
    } catch (err) {
      if (isNetworkFailure(err)) {
        setNoteOpen(false);
        setOffline(true);
      } else {
        if (!(err instanceof ApiClientError)) {
          reportError("trainer.exception.note", err);
        }
        setNoteError(
          userFacingMessage(err, { fallback: "Could not save note. (NOTE-ERR)" }),
        );
      }
    } finally {
      setActing(false);
    }
  }

  if (notFound) {
    return (
      <Screen v3 chrome="app" title="Exception" showHeader={false}>
        <TopBar title={null} onBack={onBack} />
        <View style={styles.gone} testID="exception-not-found">
          <View style={styles.goneIcon}>
            <CircleCheck size={32} color={theme.colors.ink} strokeWidth={1.75} />
          </View>
          <Text variant="title" style={styles.center} accessibilityRole="header">
            {NOT_FOUND_TITLE}
          </Text>
          <Text variant="body" tone="ink2" style={styles.center}>
            {NOT_FOUND_BODY}
          </Text>
          <Button
            label={BACK_TO_NEEDS_YOU}
            variant="tint"
            onPress={onBack}
            style={styles.goneAction}
          />
        </View>
      </Screen>
    );
  }

  const ended = coaching === "ended";
  const status: ExceptionReviewStatus | null = detail
    ? exceptionReviewStatus(detail.status, ended)
    : null;
  const name = formatPersonName(client?.name ?? "");
  const first = firstNameOf(client?.name);
  const nudgeable = detail ? isNudgeableExceptionType(detail.type) : false;
  const live = coaching === "active" && status != null && status !== "resolved";
  const footer =
    detail && live ? exceptionFooterActions(status!, nudgeable) : null;
  const disabled = offline || acting;
  const title = detail ? labelFor("exception_type", detail.type) : null;

  const runAction = (action: ExceptionFooterAction) => {
    if (action === "markReviewed") void markReviewed();
    else if (action === "nudge") setNudgeOpen(true);
    else {
      setResolveError(null);
      resolveKey.current = null;
      setResolveOpen(true);
    }
  };
  const footerButton = (action: ExceptionFooterAction, primary: boolean) => (
    <Button
      key={action}
      label={
        action === "markReviewed"
          ? "Mark reviewed"
          : action === "nudge"
            ? "Nudge"
            : "Resolve"
      }
      variant={primary ? "primary" : "secondary"}
      icon={
        action === "nudge" ? (
          <Bell
            size={20}
            strokeWidth={1.75}
            color={
              disabled
                ? theme.colors.ink4
                : primary
                  ? theme.colors.onBrand
                  : theme.colors.ink
            }
          />
        ) : undefined
      }
      disabled={disabled}
      loading={acting && action === "markReviewed"}
      onPress={() => runAction(action)}
      testID={`exception-${action}`}
      style={primary ? styles.footerPrimary : styles.footerSecondary}
    />
  );

  return (
    <Screen
      v3
      chrome="app"
      title={title ?? "Exception"}
      showHeader={false}
      footer={
        footer && (footer.primary || footer.secondary) ? (
          <View style={styles.footerRow}>
            {footer.secondary ? footerButton(footer.secondary, false) : null}
            {footer.primary ? footerButton(footer.primary, true) : null}
          </View>
        ) : undefined
      }
    >
      <View testID="exception-review">
        <TopBar
          title={title}
          onBack={onBack}
          onMore={detail && live ? () => setMoreOpen(true) : undefined}
        />

        {offline ? (
          <StateBanner
            tone="neutral"
            icon={(c) => <WifiOff size={20} color={c} strokeWidth={1.75} />}
            text={offlineBannerText(Boolean(detail))}
            actionLabel="Try again"
            onAction={() => {
              void load();
            }}
          />
        ) : null}
        {detail && status === "ended" ? (
          <StateBanner
            tone="neutral"
            icon={(c) => <Ban size={20} color={c} strokeWidth={1.75} />}
            text={endedBannerText(first, client?.endedAt ?? null, trainerZone)}
          />
        ) : null}
        {detail && status === "reviewed" && !offline ? (
          <StateBanner
            tone="neutral"
            icon={(c) => <Eye size={20} color={c} strokeWidth={1.75} />}
            text={reviewedBannerText(detail.acknowledgedAt, trainerZone)}
          />
        ) : null}
        {detail && status === "resolved" ? (
          <StateBanner
            tone="done"
            icon={(c) => <CircleCheck size={20} color={c} strokeWidth={1.75} />}
            text={resolvedBannerText(
              detail,
              trainerZone,
              undefined,
              resolvedOutcomePhrase(resolvedOutcome, first),
            )}
          />
        ) : null}
        {error ? <ErrorBanner message={error} /> : null}

        {!detail ? (
          loading ? (
            <LoadingSkeleton />
          ) : null
        ) : (
          <View style={styles.stack}>
            <Identity
              name={name}
              subtitle={exceptionHeaderSubtitle({
                goalShort: client?.goalShort ?? null,
                weekNumber: coachingWeekNumber(client?.startedAt),
                ageLabel:
                  status === "resolved"
                    ? null
                    : formatAttentionAge(exceptionAgeMinutes(detail)),
                endedDay:
                  ended && client?.endedAt
                    ? civilDayLine(client.endedAt, trainerZone)
                    : null,
              })}
              severity={detail.severity}
              status={status!}
            />

            {card ? (
              <View style={[styles.card, ended ? styles.cardMuted : null]}>
                <Text variant="label">What happened</Text>
                <Text variant="headline" style={styles.cardTitle}>
                  {card.title}
                </Text>
                {card.body ? (
                  <Text variant="body" tone="ink2">
                    {card.body}
                  </Text>
                ) : null}
                <View style={styles.kv}>
                  {card.planned ? <KvRow label="Planned" value={card.planned} /> : null}
                  <KvRow label="Logged" value={card.logged} />
                  {card.reminder ? <KvRow label="Reminder" value={card.reminder} /> : null}
                </View>
              </View>
            ) : null}

            {week && !ended ? <WeekCard week={week} /> : null}

            {coaching === "unknown" && !offline && !loading ? (
              <Button
                label="Try again"
                variant="secondary"
                onPress={() => {
                  void load();
                }}
              />
            ) : null}
          </View>
        )}
      </View>

      {detail ? (
        <>
          <ResolveSheet
            visible={resolveOpen}
            detail={detail}
            traineeDisplayName={client?.name ?? ""}
            acting={acting}
            errorMessage={resolveError}
            onDismiss={() => setResolveOpen(false)}
            onConfirm={(input) => {
              void resolve(input);
            }}
          />
          <MoreSheet
            visible={moreOpen}
            traineeDisplayName={client?.name ?? ""}
            onDismiss={() => setMoreOpen(false)}
            onAddNote={() => {
              setNoteError(null);
              noteKey.current = null;
              setNoteOpen(true);
            }}
            onMessageOnWhatsApp={() => {
              // A wa.me chat with no template (TM-04j); the trainer sends it.
              void openContextualWhatsApp({
                phoneE164: client?.whatsappE164 ?? null,
              });
            }}
            onOpenProfile={() => onOpenClient(detail.coachingRelationshipId)}
          />
          <NoteSheet
            visible={noteOpen}
            traineeDisplayName={client?.name ?? ""}
            acting={acting}
            errorMessage={noteError}
            onDismiss={() => setNoteOpen(false)}
            onSave={(input) => {
              void saveNote(input);
            }}
          />
          <NudgeSheet
            visible={nudgeOpen}
            target={nudgeTargetFromException(detail)}
            traineeDisplayName={client?.name ?? ""}
            clientTimeZone={client?.zone ?? null}
            trainerDisplayName={me?.trainerProfile?.displayName ?? null}
            api={clientStatusApi(api)}
            onDismiss={() => setNudgeOpen(false)}
            onSent={(line) => {
              setNudgeOpen(false);
              setToast(line);
            }}
          />
        </>
      ) : null}
      {toast ? (
        <Snackbar message={toast} leadingCheck onDismiss={() => setToast(null)} />
      ) : null}
    </Screen>
  );
}

function TopBar({
  title,
  onBack,
  onMore,
}: {
  title: string | null;
  onBack: () => void;
  onMore?: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={styles.topBtn}
        testID="exception-back"
      >
        <ChevronLeft size={26} color={theme.colors.ink} strokeWidth={2} />
      </Pressable>
      <Text
        variant="headline"
        style={styles.topTitle}
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title ?? ""}
      </Text>
      {onMore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More actions"
          onPress={onMore}
          style={[styles.topBtn, styles.moreBtn]}
          testID="exception-more"
        >
          <Ellipsis size={22} color={theme.colors.ink} strokeWidth={2} />
        </Pressable>
      ) : (
        <View style={styles.topBtn} />
      )}
    </View>
  );
}

function Identity({
  name,
  subtitle,
  severity,
  status,
}: {
  name: string;
  subtitle: string;
  severity: ExceptionDetail["severity"];
  status: ExceptionReviewStatus;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const c = theme.colors;
  const avatar =
    status === "ended"
      ? { bg: c.fill, ink: c.ink3 }
      : severity === "critical"
        ? { bg: c.critTint, ink: c.crit }
        : { bg: c.warnTint, ink: c.warn };
  const showSeverity = status === "open" || status === "reviewed";
  return (
    <View style={styles.identity}>
      <View
        style={[styles.avatar, { backgroundColor: avatar.bg }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={[styles.avatarText, { color: avatar.ink }]}>
          {initialsFromName(name)}
        </Text>
      </View>
      <View style={styles.identityText}>
        <Text variant="title">{name}</Text>
        {subtitle ? <Text variant="subhead">{subtitle}</Text> : null}
        <View style={styles.tags}>
          {showSeverity ? (
            <Tag
              label={labelFor("exception_severity", severity)}
              bg={severity === "critical" ? c.critTint : c.warnTint}
              ink={severity === "critical" ? c.crit : c.warn}
              icon={(color) => <CircleAlert size={16} color={color} strokeWidth={2} />}
            />
          ) : null}
          <Tag
            label={exceptionStatusChipLabel(status)}
            bg={status === "resolved" ? c.doneTint : c.fill}
            ink={status === "resolved" ? c.done : c.ink2}
            icon={(color) =>
              status === "resolved" ? (
                <Check size={16} color={color} strokeWidth={2.25} />
              ) : status === "reviewed" ? (
                <Eye size={16} color={color} strokeWidth={2} />
              ) : status === "ended" ? (
                <Ban size={16} color={color} strokeWidth={2} />
              ) : (
                <ClipboardCheck size={16} color={color} strokeWidth={2} />
              )
            }
          />
        </View>
      </View>
    </View>
  );
}

function Tag({
  label,
  bg,
  ink,
  icon,
}: {
  label: string;
  bg: string;
  ink: string;
  icon: (color: string) => ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      {icon(ink)}
      <Text variant="bodyStrong" style={[styles.tagText, { color: ink }]}>
        {label}
      </Text>
    </View>
  );
}

function KvRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.kvRow}>
      <Text variant="body" tone="ink2">
        {label}
      </Text>
      <Text variant="bodyStrong" style={styles.kvValue}>
        {value}
      </Text>
    </View>
  );
}

function WeekCard({ week }: { week: ExceptionWeekModel }) {
  const theme = useTheme();
  const styles = useStyles();
  const c = theme.colors;
  return (
    <View style={styles.card} testID="exception-week">
      <View style={styles.weekHead}>
        <Text variant="headline">This week</Text>
        <Text variant="caption">{week.range}</Text>
      </View>
      <View style={styles.weekDays}>
        {week.days.map((day) => (
          <View
            key={day.date}
            style={styles.weekDay}
            accessible
            accessibilityLabel={`${day.letter}: ${
              day.mark === "done"
                ? "done"
                : day.mark === "missed"
                  ? "missed"
                  : day.mark === "today"
                    ? "today"
                    : day.mark === "upcoming"
                      ? "planned"
                      : "nothing planned"
            }`}
          >
            <Text variant="caption">{day.letter}</Text>
            <View
              style={[
                styles.dot,
                day.mark === "done"
                  ? { backgroundColor: c.doneTint }
                  : day.mark === "missed"
                    ? { backgroundColor: c.critTint }
                    : day.mark === "today"
                      ? { borderColor: c.coral, borderWidth: 2.5 }
                      : day.mark === "upcoming"
                        ? { borderColor: c.line2, borderWidth: 1.5 }
                        : { backgroundColor: c.fill },
              ]}
            >
              {day.mark === "done" ? (
                <Check size={18} color={c.done} strokeWidth={2.25} />
              ) : day.mark === "missed" ? (
                <X size={18} color={c.crit} strokeWidth={2.25} />
              ) : day.mark === "rest" ? (
                <Minus size={16} color={c.ink4} strokeWidth={2} />
              ) : null}
            </View>
          </View>
        ))}
      </View>
      <View style={styles.weekTotals}>
        <Text variant="body" tone="ink2">
          <Text variant="bodyStrong">{`${week.workoutsDone} of ${week.workoutsPlanned}`}</Text>
          {" workouts"}
        </Text>
        <Text variant="body" tone="ink2">
          <Text variant="bodyStrong">{`${week.mealsLogged} of ${week.mealsPlanned}`}</Text>
          {" meals"}
        </Text>
      </View>
    </View>
  );
}

type BannerTone = "neutral" | "done";

function StateBanner({
  tone,
  icon,
  text,
  actionLabel,
  onAction,
}: {
  tone: BannerTone;
  icon: (color: string) => ReactNode;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const bg = tone === "done" ? theme.colors.doneTint : theme.colors.fill;
  const ink = tone === "done" ? theme.colors.done : theme.colors.ink2;
  return (
    <View
      accessibilityRole="alert"
      style={[styles.stateBanner, { backgroundColor: bg }]}
    >
      {icon(ink)}
      <View style={styles.stateBannerBody}>
        <Text variant="body" style={{ color: ink }}>
          {text}
        </Text>
        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            onPress={onAction}
            style={styles.stateBannerAction}
          >
            <Text variant="bodyStrong" style={{ color: ink }}>
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Placeholder cards while the exception loads. */
function LoadingSkeleton() {
  const styles = useStyles();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading exception"
      style={styles.stack}
    >
      <View style={styles.card}>
        <View style={[styles.skelBar, { width: "45%" }]} />
        <View style={[styles.skelBar, { width: "80%" }]} />
      </View>
      <View style={styles.card}>
        <View style={[styles.skelBar, { width: "70%" }]} />
        <View style={[styles.skelBar, { width: "90%" }]} />
        <View style={[styles.skelBar, { width: "60%" }]} />
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: t.spacing.sm,
    marginBottom: t.spacing.lg,
    marginTop: -t.spacing.md,
  },
  topBtn: {
    alignItems: "center",
    height: t.touchTarget,
    justifyContent: "center",
    width: t.touchTarget,
  },
  moreBtn: { backgroundColor: t.colors.fill, borderRadius: 999 },
  topTitle: { flex: 1, textAlign: "center" },
  stateBanner: {
    alignItems: "center",
    borderRadius: t.radii.card,
    flexDirection: "row",
    gap: t.spacing.md,
    marginBottom: t.spacing.lg,
    padding: t.spacing.lg,
  },
  stateBannerBody: { flex: 1, gap: t.spacing.xs },
  stateBannerAction: { justifyContent: "center", minHeight: t.touchTarget },
  stack: { gap: t.spacing.md },
  identity: {
    alignItems: "center",
    flexDirection: "row",
    gap: t.spacing.lg,
    marginBottom: t.spacing.xs,
  },
  avatar: {
    alignItems: "center",
    borderRadius: 34,
    height: 68,
    justifyContent: "center",
    width: 68,
  },
  avatarText: { fontSize: 24, fontWeight: "700" },
  identityText: { flex: 1, gap: 2 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm, marginTop: t.spacing.xs },
  tag: {
    alignItems: "center",
    borderRadius: t.radii.tag,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { fontSize: 14 },
  card: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: t.radii.card,
    borderWidth: 1,
    gap: t.spacing.sm,
    padding: t.spacing.lg,
  },
  cardMuted: { opacity: 0.75 },
  cardTitle: { marginTop: 2 },
  kv: { marginTop: t.spacing.xs },
  kvRow: {
    alignItems: "center",
    borderTopColor: t.colors.line,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: t.spacing.md,
    justifyContent: "space-between",
    paddingVertical: t.spacing.md,
  },
  kvValue: { flexShrink: 1, textAlign: "right" },
  weekHead: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  weekDays: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: t.spacing.sm,
  },
  weekDay: { alignItems: "center", gap: t.spacing.sm },
  dot: {
    alignItems: "center",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  weekTotals: { flexDirection: "row", gap: t.spacing.xl, marginTop: t.spacing.sm },
  footerRow: { flexDirection: "row", gap: t.spacing.md },
  footerSecondary: { flex: 1 },
  footerPrimary: { flex: 1.25 },
  gone: {
    alignItems: "center",
    gap: t.spacing.lg,
    paddingTop: t.spacing.xxxl * 2,
  },
  goneIcon: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 24,
    height: 76,
    justifyContent: "center",
    width: 76,
  },
  center: { textAlign: "center" },
  goneAction: { alignSelf: "stretch", marginHorizontal: t.spacing.xl },
  skelBar: {
    backgroundColor: t.colors.fill2,
    borderRadius: 7,
    height: 14,
  },
}));
