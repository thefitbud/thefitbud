import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, View } from "react-native";
import {
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
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
import { ClientAvatar, ClientNameLink } from "./ClientAvatar";
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
import { clientStatusApi } from "./clientStatus/api";
import { labelFor } from "./labels";
import {
  buildReviewSheetCardModel,
  coachingWeekNumber,
  type ReviewSheetCardModel,
} from "./reviewSheetContent";
import { ReviewActions, type ReviewActionsState } from "./review/ReviewActions";
import { ReviewCard } from "./review/ReviewCard";
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
  exceptionHeaderSubtitle,
  exceptionReviewStatus,
  isNetworkFailure,
  isNotFound,
  offlineBannerText,
  resolvedBannerText,
  resolvedOutcomePhrase,
  notedStateLine,
  type ExceptionReviewStatus,
} from "./sheets/exceptionStateContent";
import {
  exceptionWeekModel,
  type ExceptionWeekModel,
} from "./sheets/exceptionWeek";
import {
  isNudgeableExceptionType,
  nudgeTargetFromException,
} from "./sheets/nudgeContent";
import {
  clientMetaFromWorkspaceHeader,
  readClientMeta,
  trainerCacheEpoch,
  writeClientMeta,
  type ClientMeta,
} from "./cache";
import {
  dropReviewItem,
  readReviewItem,
  storeReviewItem,
} from "./reviewItemCache";
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

function mealKcalOf(meal: MealAssignment | null): number | null {
  if (!meal) return null;
  const sum = plannedRowsFromAssignment(meal).reduce(
    (total, row) => total + (row.kcalPreview ?? 0),
    0,
  );
  return sum > 0 ? sum : null;
}

function infoFromMeta(meta: ClientMeta | null): ClientInfo | null {
  if (!meta || meta.name == null) return null;
  return {
    name: meta.name,
    zone: meta.timeZone,
    whatsappE164: meta.whatsappE164,
    goalShort: meta.goalShort,
    startedAt: meta.startedAt,
    endedAt: meta.endedAt,
  };
}

function ExceptionReviewBody({ exceptionId, onBack, onOpenClient }: Props) {
  const { api, me } = useAuth();
  const theme = useTheme();
  const styles = useStyles();
  const trainerZone = deviceTimeZone();
  // Z14-3: an item the review sheet already loaded, and its client's header
  // cache entry, paint at once; the reads below refresh underneath.
  const [kept] = useState(() => readReviewItem(exceptionId));
  const [keptInfo] = useState(() =>
    kept
      ? infoFromMeta(readClientMeta(kept.bundle.detail.coachingRelationshipId))
      : null,
  );
  const painted = useRef(kept != null);
  const [detail, setDetail] = useState<ExceptionDetail | null>(
    kept?.bundle.detail ?? null,
  );
  const [card, setCard] = useState<ReviewSheetCardModel | null>(() =>
    kept
      ? buildReviewSheetCardModel({
          detail: kept.bundle.detail,
          ageMinutes: exceptionAgeMinutes(kept.bundle.detail),
          workout: kept.bundle.workout,
          meal: kept.bundle.meal,
          mealKcal: mealKcalOf(kept.bundle.meal),
          timeZone: keptInfo?.zone ?? undefined,
        })
      : null,
  );
  const [week, setWeek] = useState<ExceptionWeekModel | null>(null);
  const [client, setClient] = useState<ClientInfo | null>(keptInfo);
  const [loading, setLoading] = useState(kept == null);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // "unknown" until the client workspace answers: live actions stay hidden
  // so an ended client is never offered Mark reviewed, Resolve, Note or Nudge.
  const [coaching, setCoaching] = useState<"unknown" | "active" | "ended">(
    keptInfo ? (keptInfo.endedAt ? "ended" : "active") : "unknown",
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
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  // One idempotency key per composer session, reused when Save is retried.
  const noteKey = useRef<string | null>(null);
  // One key per Noted / Resolve attempt, reused on a retry of the same press.
  const ackKey = useRef<string | null>(null);
  const resolveKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    // Only a load with nothing on screen shows the loading state; a refresh
    // (or the reload after an action) works underneath.
    if (!painted.current) setLoading(true);
    setError(null);
    setNotFound(false);
    const cacheEpoch = trainerCacheEpoch();
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
          userFacingMessage(err, {
            fallback: "Something went wrong on our side. Try again.",
          }),
        );
      }
      setLoading(false);
      return;
    }
    setDetail(result);
    setOffline(false);
    const relationshipId = result.coachingRelationshipId;
    // One parallel round for everything else: the client header, the source
    // assignment and the week strip. The week uses the cached client zone (or
    // the trainer's own) so it need not wait for the workspace.
    const weekZone = readClientMeta(relationshipId)?.timeZone ?? trainerZone;
    const weekToday = localDateInTimezone(weekZone);
    const weekFrom = startOfWeekMonday(weekToday);
    const weekTo = addDays(weekFrom, 6);
    const [workspaceRead, sourceRead, weekRead] = await Promise.all([
      api.getClientWorkspace(relationshipId).then(
        (workspace) => ({ ok: true as const, workspace }),
        (err: unknown) => ({ ok: false as const, err }),
      ),
      (async (): Promise<{
        workout: WorkoutAssignment | null;
        meal: MealAssignment | null;
      }> => {
        // The card's Planned row is context: a failed read drops that row,
        // never the review itself.
        try {
          if (result.sourceEntityType === "workout_assignment") {
            return {
              workout: await api.getWorkoutAssignment(result.sourceEntityId),
              meal: null,
            };
          }
          if (result.sourceEntityType === "meal_assignment") {
            return {
              workout: null,
              meal: await api.getMealAssignment(result.sourceEntityId),
            };
          }
        } catch (err) {
          if (!isNetworkFailure(err))
            reportError("trainer.exception.source", err);
        }
        return { workout: null, meal: null };
      })(),
      result.status === "resolved"
        ? Promise.resolve(null)
        : Promise.all([
            api.listWorkoutAssignments(relationshipId, {
              fromDate: weekFrom,
              toDate: weekTo,
            }),
            api.listMealAssignments(relationshipId, {
              fromDate: weekFrom,
              toDate: weekTo,
            }),
          ]).catch((err: unknown) => {
            if (!isNetworkFailure(err))
              reportError("trainer.exception.week", err);
            return null;
          }),
    ]);
    let info: ClientInfo | null = null;
    if (workspaceRead.ok) {
      const header = workspaceRead.workspace.header;
      writeClientMeta(
        relationshipId,
        clientMetaFromWorkspaceHeader(header),
        cacheEpoch,
      );
      info = {
        name: header.traineeDisplayName,
        zone: header.traineeTimezone ?? null,
        whatsappE164: header.clientWhatsappE164 ?? null,
        goalShort: header.goalShort ?? null,
        startedAt: header.startedAt ?? null,
        endedAt: header.endedAt ?? null,
      };
      setClient(info);
      setCoaching(info.endedAt ? "ended" : "active");
    } else {
      // Ended-ness is unknown: keep live actions hidden until a retry works.
      setCoaching("unknown");
      if (isNetworkFailure(workspaceRead.err)) {
        setOffline(true);
      } else {
        reportError("trainer.exception.workspace", workspaceRead.err);
        setError("Couldn't check the client's status. Try again.");
      }
    }
    storeReviewItem(
      { detail: result, workout: sourceRead.workout, meal: sourceRead.meal },
      cacheEpoch,
    );
    setCard(
      buildReviewSheetCardModel({
        detail: result,
        ageMinutes: exceptionAgeMinutes(result),
        workout: sourceRead.workout,
        meal: sourceRead.meal,
        mealKcal: mealKcalOf(sourceRead.meal),
        timeZone: info?.zone ?? undefined,
      }),
    );
    if (info && !info.endedAt && result.status !== "resolved" && weekRead) {
      const zone = info.zone ?? trainerZone;
      const today = localDateInTimezone(zone);
      const start = startOfWeekMonday(today);
      setWeek(
        exceptionWeekModel({
          dates: weekDatesFrom(start),
          today,
          workouts: weekRead[0].items,
          meals: weekRead[1].items,
        }),
      );
    } else {
      setWeek(null);
    }
    painted.current = true;
    setLoading(false);
  }, [api, exceptionId, trainerZone]);

  useEffect(() => {
    void load();
  }, [load]);

  async function noted() {
    setActing(true);
    setError(null);
    ackKey.current ??= createIdempotencyKey();
    try {
      await api.acknowledgeException(exceptionId, {}, ackKey.current);
      ackKey.current = null;
      dropReviewItem(exceptionId);
      await load();
    } catch (err) {
      if (isNetworkFailure(err)) {
        setOffline(true);
      } else {
        if (!(err instanceof ApiClientError)) {
          reportError("trainer.exception.acknowledge", err);
        }
        setError(
          userFacingMessage(err, {
            fallback: "Something went wrong on our side. Try again.",
          }),
        );
      }
    } finally {
      setActing(false);
    }
  }

  async function undoNoted() {
    setActing(true);
    setError(null);
    try {
      await api.undoExceptionAcknowledge(exceptionId, createIdempotencyKey());
      dropReviewItem(exceptionId);
      await load();
    } catch (err) {
      if (isNetworkFailure(err)) {
        setOffline(true);
      } else {
        if (!(err instanceof ApiClientError)) {
          reportError("trainer.exception.undo", err);
        }
        setError(
          userFacingMessage(err, {
            fallback: "Something went wrong on our side. Try again.",
          }),
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
    ackKey.current ??= createIdempotencyKey();
    try {
      // The API resolves an acknowledged item only: an item still open is
      // noted first, as the review sheet does. Both calls reuse their keys.
      if (
        detail &&
        (detail.status === "detected" || detail.status === "active")
      ) {
        await api.acknowledgeException(exceptionId, {}, ackKey.current);
        ackKey.current = null;
      }
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
      dropReviewItem(exceptionId);
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
        dropReviewItem(exceptionId);
        setResolvedOutcome(input.outcome);
        setResolveOpen(false);
        await load();
      } else {
        if (!(err instanceof ApiClientError)) {
          reportError("trainer.exception.resolve", err);
        }
        setResolveError(
          userFacingMessage(err, {
            fallback: "Something went wrong on our side. Try again.",
          }),
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
          userFacingMessage(err, {
            fallback: "Something went wrong on our side. Try again.",
          }),
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
            <CircleCheck
              size={32}
              color={theme.colors.ink}
              strokeWidth={1.75}
            />
          </View>
          <Text
            variant="title"
            style={styles.center}
            accessibilityRole="header"
          >
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
  const disabled = offline || acting;
  const title = detail ? labelFor("exception_type", detail.type) : null;
  const actionsState: ReviewActionsState | null =
    status === "open"
      ? "open"
      : status === "reviewed"
        ? "noted"
        : status === "resolved"
          ? "resolved"
          : status === "ended"
            ? "ended"
            : null;
  const openNudge = () => setNudgeOpen(true);
  const openResolve = () => {
    setResolveError(null);
    resolveKey.current = null;
    setResolveOpen(true);
  };
  const openNote = () => {
    setNoteError(null);
    noteKey.current = null;
    setNoteOpen(true);
  };
  const stateLine =
    detail && status === "resolved"
      ? resolvedBannerText(
          detail,
          trainerZone,
          undefined,
          resolvedOutcomePhrase(resolvedOutcome, first),
        )
      : status === "reviewed"
        ? notedStateLine(detail?.acknowledgedAt ?? null, trainerZone)
        : null;

  return (
    <Screen v3 chrome="app" title={title ?? "Exception"} showHeader={false}>
      <View testID="exception-review">
        <TopBar title={title} onBack={onBack} />

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
        {error ? <ErrorBanner message={error} /> : null}

        {!detail ? (
          loading ? (
            <LoadingSkeleton />
          ) : null
        ) : (
          <View style={styles.stack}>
            <Identity
              name={name}
              onOpenProfile={
                detail.coachingRelationshipId
                  ? () => onOpenClient(detail.coachingRelationshipId)
                  : undefined
              }
              subtitle={exceptionHeaderSubtitle({
                goalShort: client?.goalShort ?? null,
                weekNumber: coachingWeekNumber(client?.startedAt),
                ageLabel: null,
                endedDay:
                  ended && client?.endedAt
                    ? civilDayLine(client.endedAt, trainerZone)
                    : null,
              })}
              severity={detail.severity}
              status={status!}
            />

            {card ? (
              <ReviewCard
                card={card}
                noted={status === "reviewed"}
                resolved={status === "resolved"}
                muted={ended}
              />
            ) : null}

            {actionsState && (live || actionsState === "resolved") ? (
              <ReviewActions
                state={actionsState}
                firstName={first}
                remindable={nudgeable}
                disabled={disabled}
                acting={acting}
                stateLine={stateLine}
                onRemind={openNudge}
                onNoted={() => {
                  void noted();
                }}
                onResolve={openResolve}
                onUndo={
                  actionsState === "noted"
                    ? () => {
                        void undoNoted();
                      }
                    : undefined
                }
                onAddNote={openNote}
                onWhatsApp={() => {
                  // A wa.me chat with no template; the trainer sends it.
                  void openContextualWhatsApp({
                    phoneE164: client?.whatsappE164 ?? null,
                  });
                }}
                testIdPrefix="exception"
              />
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
        <Snackbar
          message={toast}
          leadingCheck
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </Screen>
  );
}

function TopBar({
  title,
  onBack,
}: {
  title: string | null;
  onBack: () => void;
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
      <View style={styles.topBtn} />
    </View>
  );
}

function Identity({
  name,
  subtitle,
  severity,
  status,
  onOpenProfile,
}: {
  name: string;
  onOpenProfile?: (() => void) | undefined;
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
  return (
    <View style={styles.identity}>
      <ClientAvatar
        name={name}
        size={40}
        fontSize={13}
        fontWeight="600"
        tone={{ backgroundColor: avatar.bg, color: avatar.ink }}
        onPress={onOpenProfile}
      />
      <View style={styles.identityText}>
        <View style={styles.nameRow}>
          <ClientNameLink
            name={name}
            variant="headline"
            onPress={onOpenProfile}
          >
            {name}
          </ClientNameLink>
          {onOpenProfile ? (
            <ChevronRight size={16} color={c.ink3} strokeWidth={2} />
          ) : null}
        </View>
        {subtitle ? <Text variant="caption">{subtitle}</Text> : null}
      </View>
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
  nameRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: t.spacing.sm,
    marginTop: t.spacing.xs,
  },
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
  weekTotals: {
    flexDirection: "row",
    gap: t.spacing.xl,
    marginTop: t.spacing.sm,
  },
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
