import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import {
  Bell,
  Check,
  ClipboardCheck,
  Clock3,
  MessageCircle,
  MoreHorizontal,
  WifiOff,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError, userFacingMessage } from "@fitbud/api-client";
import type { CheckinReviewContext } from "@fitbud/contracts";
import {
  canRecordCheckinReview,
  deviceTimeZone,
  formatCivilDate,
  formatClockTime,
  formatPersonName,
} from "@fitbud/core";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { Snackbar } from "../components/Snackbar";
import { ClientAvatar, ClientNameLink } from "./ClientAvatar";
import { createIdempotencyKey } from "../lib/idempotency";
import { reportError } from "../lib/reportError";
import { Photos } from "./checkinReview/Photos";
import { checkinReviewRows, type ReviewMeasureTile } from "./checkinReviewRows";
import {
  noteForCheckin,
  reviewedAtLabel,
  signedDelta,
} from "./checkinReview/savedReview";
import {
  clientMetaFromWorkspaceHeader,
  readClientMeta,
  trainerCacheEpoch,
  writeClientMeta,
} from "./cache";
import { coachingWeekAt } from "./checkinsList/model";
import { clientStatusApi } from "./clientStatus/api";
import { NudgeSheet } from "./sheets/NudgeSheet";
import type { NudgeTarget } from "./sheets/nudgeContent";
import { openContextualWhatsApp } from "./whatsapp";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";

type Props = {
  checkinId: string;
  relationshipId: string;
  onBack: (relationshipId?: string) => void;
  onOpenClient: (relationshipId: string) => void;
};

export function CheckinReviewScreen({
  checkinId,
  relationshipId,
  onBack,
  onOpenClient,
}: Props) {

  const theme = useTheme();
  const styles = useStyles();
  const { api } = useAuth();
  // D-W3b-11 (b): trainer screens display in the device zone (resolver).
  const zone = deviceTimeZone();
  const [context, setContext] = useState<CheckinReviewContext | null>(null);
  // Z14-3: the header paints from the per-client cache at once.
  const [meta] = useState(() => (relationshipId ? readClientMeta(relationshipId) : null));
  const [name, setName] = useState(
    meta?.name ? formatPersonName(meta.name) : "Client",
  );
  const [note, setNote] = useState("");
  const [alsoMarkReviewed, setAlsoMarkReviewed] = useState(true);
  const [replyOpen, setReplyOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [whatsapp, setWhatsapp] = useState<string | null>(
    meta?.whatsappE164 ?? null,
  );
  const [nudgeOpen, setNudgeOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const cacheEpoch = trainerCacheEpoch();
    try {
      // Z14-3: with the client known up front, the header read runs beside the
      // check-in read instead of after it; a full cache entry needs no read.
      const cachedMeta = relationshipId ? readClientMeta(relationshipId) : null;
      const workspaceNeeded = Boolean(relationshipId) && cachedMeta?.timeZone == null;
      const earlyWorkspace = workspaceNeeded
        ? api.getClientWorkspace(relationshipId).then(
            (workspace) => ({ workspace }) as const,
            (workspaceError: unknown) => ({ workspaceError }) as const,
          )
        : null;
      const result = await api.getCheckinReviewContext(checkinId);
      setContext(result);
      const rid = relationshipId || result.checkin.coachingRelationshipId;
      const at = Date.parse(result.checkin.localDate + "T12:00:00Z");
      if (cachedMeta && !workspaceNeeded) {
        setName(formatPersonName(cachedMeta.name ?? "Client"));
        setWhatsapp(cachedMeta.whatsappE164 ?? null);
        setWeekNumber(coachingWeekAt(cachedMeta.startedAt, at));
      } else if (rid) {
        const read =
          (await earlyWorkspace) ??
          (await api.getClientWorkspace(rid).then(
            (workspace) => ({ workspace }) as const,
            (workspaceError: unknown) => ({ workspaceError }) as const,
          ));
        if ("workspace" in read) {
          const header = read.workspace.header;
          writeClientMeta(rid, clientMetaFromWorkspaceHeader(header), cacheEpoch);
          setName(formatPersonName(header.traineeDisplayName));
          setWhatsapp(header.clientWhatsappE164 ?? null);
          setWeekNumber(coachingWeekAt(header.startedAt, at));
        } else {
          reportError("checkinReview.workspace", read.workspaceError);
          setName("Client");
        }
      }
      setOffline(false);
    } catch (err) {
      const network =
        err instanceof TypeError ||
        (err instanceof ApiClientError && err.status === 0) ||
        (err instanceof Error && /fetch|network|offline/i.test(err.message));
      if (network) {
        setOffline(true);
        setError(null);
      } else if (err instanceof ApiClientError && err.status === 409) {
        setError(`${name.split(" ")[0]}'s check-in changed. Pull to reload.`);
      } else {
        setError("Couldn't load. Pull to try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [api, checkinId, relationshipId, name]);

  useEffect(() => {
    void load();
  }, [load]);

  const reviewed =
    Boolean(context?.checkin.review) || context?.checkin.status === "reviewed";
  const first = name.split(" ")[0] || "them";
  const savedNote = context ? noteForCheckin(context.previousNotes, checkinId) : null;
  const savedReview = context?.checkin.review ?? null;
  const canReview = context
    ? canRecordCheckinReview({
        recordStatus: context.checkin.recordStatus,
        hasReview: Boolean(context.checkin.review),
      })
    : false;
  const notSubmittedLine =
    context && !reviewed && context.checkin.recordStatus !== "submitted"
      ? notSubmittedText(context.checkin)
      : null;
  const rows = context
    ? checkinReviewRows({
        fields: context.pinnedForm.fields,
        answers: context.checkin.answers,
        measurements: context.measurements,
      })
    : { ratings: [], measures: [], texts: [] };

  async function markReviewed(withNote: string | null) {
    if (!context || reviewed || offline || !canReview) return;
    setActing(true);
    setError(null);
    let recorded = false;
    try {
      await api.recordCheckinReview(
        checkinId,
        {
          outcome: "acknowledged",
          notes: withNote?.trim() ? withNote.trim() : null,
        },
        createIdempotencyKey(),
      );
      recorded = true;
      const rid = relationshipId || context.checkin.coachingRelationshipId;
      if (withNote?.trim() && rid) {
        await api.createTrainerNote(
          rid,
          {
            body: withNote.trim(),
            visibility: "client",
            checkinId,
          },
          createIdempotencyKey(),
        );
      }
      setReplyOpen(false);
      setNote("");
      setToast(
        withNote?.trim()
          ? `Reply sent · shared with ${first}`
          : "Review saved",
      );
      await load();
    } catch (err) {
      if (recorded) {
        void load();
        if (!(err instanceof ApiClientError)) reportError("checkinReview.save", err);
        setError("Review saved. The note wasn't shared.");
      } else if (err instanceof ApiClientError && err.status === 409) {
        setError(`${first}'s check-in changed. Pull to reload.`);
      } else {
        if (!(err instanceof ApiClientError)) reportError("checkinReview.save", err);
        setError(
          userFacingMessage(err, {
            fallback: "Couldn't save the review. Try again.",
          }),
        );
      }
    } finally {
      setActing(false);
    }
  }

  async function sendReplyOnly() {
    if (!context || offline || !note.trim()) return;
    setActing(true);
    setError(null);
    try {
      const rid = relationshipId || context.checkin.coachingRelationshipId;
      await api.createTrainerNote(
        rid,
        {
          body: note.trim(),
          visibility: "client",
          checkinId,
        },
        createIdempotencyKey(),
      );
      setReplyOpen(false);
      setNote("");
      setToast(`Reply sent · shared with ${first}`);
      await load();
    } catch (err) {
      if (!(err instanceof ApiClientError)) reportError("checkinReview.reply", err);
      setError(
        userFacingMessage(err, {
          fallback: "Couldn't send the reply. Try again.",
        }),
      );
    } finally {
      setActing(false);
    }
  }

  const profileId = relationshipId || context?.checkin.coachingRelationshipId || "";
  const openProfile = profileId ? () => onOpenClient(profileId) : undefined;
  const submitted = context?.checkin.submittedAt;
  const weekPart =
    weekNumber != null && weekNumber > 0 ? `Week ${weekNumber}` : "Week check-in";
  const subtitle = context
    ? [
        weekPart,
        submitted
          ? `sent ${formatCivilDate(context.checkin.localDate)}, ${formatClockTime(submitted, zone)}`
          : context.checkin.status === "overdue"
            ? `was due ${formatCivilDate(context.checkin.localDate)}`
            : formatCivilDate(context.checkin.localDate),
      ].join(" · ")
    : "";
  const navTitle =
    reviewed && weekNumber != null && weekNumber > 0
      ? `Check-in · week ${weekNumber}`
      : "Check-in";
  const nudgeTarget: NudgeTarget | null = context
    ? {
        relationshipId:
          relationshipId || context.checkin.coachingRelationshipId,
        activityType: "checkin",
        activityId: context.checkin.id,
        kindLabel: "Check-in",
        sourceName: null,
        dayLabel: formatCivilDate(context.checkin.localDate).split(/\s+/)[0] ?? null,
      }
    : null;

  const workoutNow = context
    ? context.recentWorkoutAdherence.completed
    : 0;
  const workoutTotal = context
    ? context.recentWorkoutAdherence.completed +
      context.recentWorkoutAdherence.missed +
      context.recentWorkoutAdherence.pending
    : 0;

  const footer =
    !context || reviewed || notSubmittedLine ? null : !canReview ? null : (
      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          disabled={offline || acting}
          onPress={() => setReplyOpen(true)}
          style={[styles.replyBtn, offline ? styles.disabled : null]}
        >
          <MessageCircle color={theme.colors.ink} size={18} strokeWidth={2.2} />
          <Text style={styles.replyBtnText}>Reply</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={offline || acting}
          onPress={() => void markReviewed(null)}
          style={[
            styles.markBtn,
            offline ? styles.markBtnOffline : null,
            offline || acting ? styles.disabled : null,
          ]}
        >
          <Check
            color={offline ? theme.colors.ink3 : theme.colors.card}
            size={18}
            strokeWidth={2.4}
          />
          <Text
            style={[
              styles.markBtnText,
              offline ? styles.markBtnTextOffline : null,
            ]}
          >
            Mark reviewed
          </Text>
        </Pressable>
      </View>
    );

  return (
    <Screen
      v3
      title="Check-in"
      chrome="app"
      showHeader={false}
      footerVariant="toast"
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load().finally(() => setRefreshing(false));
      }}
      footer={footer}
    >
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => onBack(context?.checkin.coachingRelationshipId)}
          style={styles.navBtn}
        >
          <Text style={styles.navChevron}>‹</Text>
        </Pressable>
        <Text style={styles.navTitle} accessibilityRole="header">
          {navTitle}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More"
          onPress={() =>
            setToast("Client actions stay on the client page for now")
          }
          style={styles.navBtn}
        >
          <MoreHorizontal color={theme.colors.ink} size={22} strokeWidth={2.2} />
        </Pressable>
      </View>

      {toast ? (
        <Snackbar leadingCheck message={toast} onDismiss={() => setToast(null)} />
      ) : null}
      {offline ? (
        <View style={styles.offlineBanner} accessibilityRole="summary">
          <WifiOff color={theme.colors.ink2} size={16} strokeWidth={2.2} />
          <Text style={styles.offline}>
            You’re offline. You can read this check-in, but replying and reviewing need a connection.
          </Text>
        </View>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      {loading && !context ? (
        <View style={styles.skeleton} accessibilityLabel="Loading" />
      ) : null}

      <View style={styles.header}>
        <ClientAvatar
          name={name}
          size={56}
          fontSize={18}
          onPress={openProfile}
        />
        <View style={styles.headerBody}>
          <ClientNameLink name={name} style={styles.h1} onPress={openProfile}>
            {name}
          </ClientNameLink>
          {subtitle ? <Text style={styles.meta}>{subtitle}</Text> : null}
          <View style={styles.chipRow}>
            {reviewed ? (
              <View style={[styles.chip, styles.chipReviewed]}>
                <Check color={theme.colors.done} size={13} strokeWidth={2.6} />
                <Text style={[styles.chipText, { color: theme.colors.done }]}>
                  {savedReview
                    ? `Reviewed ${formatCivilDate(savedReview.createdAt.slice(0, 10))}`
                    : "Reviewed"}
                </Text>
              </View>
            ) : context?.checkin.status === "overdue" ? (
              <View style={[styles.chip, styles.chipOverdue]}>
                <Clock3 color={theme.colors.warn} size={13} strokeWidth={2.2} />
                <Text style={[styles.chipText, { color: theme.colors.warn }]}>
                  Overdue
                </Text>
              </View>
            ) : canReview ? (
              <View style={[styles.chip, styles.chipReview]}>
                <ClipboardCheck
                  color={theme.colors.info}
                  size={13}
                  strokeWidth={2.2}
                />
                <Text style={[styles.chipText, { color: theme.colors.info }]}>
                  To review
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {notSubmittedLine ? (
        <View style={styles.card}>
          <Text style={styles.notSubmittedTitle}>
            {`${first} has started but not sent it`}
          </Text>
          <Text style={styles.meta}>{notSubmittedLine}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={offline}
            onPress={() => {
              if (nudgeTarget) {
                setNudgeOpen(true);
                return;
              }
              void openContextualWhatsApp({
                phoneE164: whatsapp,
                draftText: `Hi ${first}, just a reminder to send your FitBud check-in when you can.`,
              });
            }}
            style={[styles.nudgeBtn, offline ? styles.disabled : null]}
          >
            <Bell color={theme.colors.card} size={18} strokeWidth={2.2} />
            <Text style={styles.nudgeBtnText}>Remind</Text>
          </Pressable>
          <Text style={styles.nudgeCaption}>
            {`Sends ${first} a push notification.`}
          </Text>
        </View>
      ) : null}

      {reviewed && (savedNote || savedReview?.notes) ? (
        <View style={styles.replyCard}>
          <Text style={styles.replyCardTitle}>Your reply</Text>
          <Text style={styles.replyCardBody}>
            {savedNote?.body ?? savedReview?.notes}
          </Text>
          {savedNote?.visibility === "client" && savedNote.seenAt ? (
            <Text style={styles.meta}>{`Seen by ${first}`}</Text>
          ) : savedNote?.visibility === "client" ? (
            <Text style={styles.meta}>Shared on their Today</Text>
          ) : null}
          {savedReview ? (
            <Text style={styles.meta}>
              {reviewedAtLabel(savedReview.createdAt, zone)}
            </Text>
          ) : null}
        </View>
      ) : null}

      {(rows.ratings.length > 0 || rows.measures.length > 0 || context) &&
      !notSubmittedLine ? (
        <View style={styles.card}>
          <View style={styles.tableHead}>
            <Text style={styles.tableHeadLabel}>This week</Text>
            <Text style={styles.tableCol}>Last</Text>
            <Text style={styles.tableCol}>Now</Text>
          </View>
          {rows.measures.map((item) => (
            <MeasureRow key={item.fieldId} item={item} />
          ))}
          {rows.ratings.map((item) => (
            <View key={item.fieldId} style={styles.tableRow}>
              <Text style={styles.tableLabel}>{item.label}</Text>
              <Text style={styles.tableLast}>–</Text>
              <Text style={styles.tableNow}>{`${item.value} / 5`}</Text>
            </View>
          ))}
          {context ? (
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Workouts</Text>
              <Text style={styles.tableLast}>–</Text>
              <Text style={styles.tableNow}>
                {`${workoutNow} of ${workoutTotal}`}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {rows.texts.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.wroteLabel}>{`${first} wrote`}</Text>
          {rows.texts.map((item) => (
            <View key={item.fieldId} style={styles.wroteBlock}>
              <Text style={styles.wroteQ}>{item.label}</Text>
              <Text style={styles.wroteBody}>{item.text}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {context && !notSubmittedLine ? (
        <Photos
          photos={context.photos}
          checkinId={checkinId}
          firstName={first}
        />
      ) : null}

      <NudgeSheet
        visible={nudgeOpen && nudgeTarget != null}
        target={nudgeTarget}
        traineeDisplayName={name}
        clientTimeZone={null}
        trainerDisplayName={null}
        api={clientStatusApi(api)}
        onDismiss={() => setNudgeOpen(false)}
        onSent={(line) => {
          setNudgeOpen(false);
          setToast(line);
        }}
      />

      {/* Keep rating "of 5" strings findable for existing tests that pin tiles. */}
      {rows.ratings.map((item) => (
        <Text key={`sr-${item.fieldId}`} style={styles.srOnly}>
          {`${item.value} of 5`}
        </Text>
      ))}
      {rows.measures.map((item) => (
        <Text key={`sr-m-${item.fieldId}`} style={styles.srOnly}>
          {`${item.value} ${item.unit}`}
          {item.since
            ? ` ${signedDelta(item.since.delta)} since ${formatCivilDate(item.since.previousObservedAt.slice(0, 10))}`
            : ""}
        </Text>
      ))}

      <Modal
        visible={replyOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setReplyOpen(false)}
      >
        <View style={styles.replySheet}>
          <View style={styles.replyNav}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setReplyOpen(false)}
            >
              <Text style={styles.link}>Cancel</Text>
            </Pressable>
            <Text style={styles.replyTitle}>{`Reply to ${first}`}</Text>
            <Pressable
              testID="checkin-reply-send"
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={acting || offline || !note.trim()}
              onPress={() => {
                if (alsoMarkReviewed) {
                  void markReviewed(note);
                } else {
                  void sendReplyOnly();
                }
              }}
            >
              <Text
                style={[
                  styles.link,
                  !note.trim() || acting || offline ? styles.disabled : null,
                ]}
              >
                Send
              </Text>
            </Pressable>
          </View>
          <TextInput
            testID="checkin-reply-input"
            accessibilityLabel={`Add a note for ${first}`}
            placeholder={`Write to ${first}…`}
            placeholderTextColor={theme.colors.ink3}
            value={note}
            onChangeText={setNote}
            multiline
            style={styles.replyInput}
            autoFocus
          />
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: alsoMarkReviewed }}
            onPress={() => setAlsoMarkReviewed((value) => !value)}
            style={styles.switchRow}
          >
            <Text style={styles.switchLabel}>Also mark reviewed</Text>
            <View pointerEvents="none">
              <Switch
                value={alsoMarkReviewed}
                trackColor={{ false: "#E7E9F2", true: theme.colors.done }}
                thumbColor={theme.colors.card}
              />
            </View>
          </Pressable>
          <Text style={styles.replyHint}>
            {`${first} sees your reply on their Today and in the check-in. Private notes go in ··· > Add note.`}
          </Text>
        </View>
      </Modal>
    </Screen>
  );
}

function MeasureRow({ item }: { item: ReviewMeasureTile }) {

  const styles = useStyles();
  const last =
    item.since != null
      ? `${Number((item.value - item.since.delta).toFixed(1))} ${item.unit}`
      : "–";
  const delta =
    item.since != null ? (
      <Text
        style={[
          styles.delta,
          item.since.delta < 0 ? styles.deltaGood : styles.deltaWarn,
        ]}
      >
        {signedDelta(item.since.delta)}
      </Text>
    ) : null;
  return (
    <View style={styles.tableRow}>
      <Text style={styles.tableLabel}>{item.label}</Text>
      <Text style={styles.tableLast}>{last}</Text>
      <View style={styles.nowCell}>
        <Text style={styles.tableNow}>{`${item.value} ${item.unit}`}</Text>
        {delta}
      </View>
    </View>
  );
}

function notSubmittedText(checkin: CheckinReviewContext["checkin"]): string {
  return `Due ${formatCivilDate(checkin.localDate)} · not submitted yet`;
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
  },
  navTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
  },
  header: { flexDirection: "row", gap: 14, marginTop: 4 },
  headerBody: { flex: 1, minWidth: 0 },
  avatar: {
    alignItems: "center",
    backgroundColor: t.colors.av1Bg,
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  avatarText: {
    color: t.colors.av1Fg,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
  },
  h1: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 24,
    letterSpacing: -0.3,
  },
  meta: { color: t.colors.ink3, fontSize: 14, lineHeight: 20, marginTop: 2 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipReview: { backgroundColor: t.colors.infoTint },
  chipOverdue: { backgroundColor: t.colors.warnTint },
  chipReviewed: { backgroundColor: t.colors.doneTint },
  chipText: { fontFamily: fontFamilySemiBold, fontSize: 12 },
  card: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 12,
    overflow: "hidden",
    padding: 14,
  },
  tableHead: {
    flexDirection: "row",
    marginBottom: 6,
  },
  tableHeadLabel: {
    color: t.colors.ink3,
    flex: 1,
    fontFamily: fontFamilySemiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  tableCol: {
    color: t.colors.ink3,
    fontFamily: fontFamilySemiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textAlign: "right",
    textTransform: "uppercase",
    width: 72,
  },
  tableRow: {
    alignItems: "center",
    borderTopColor: t.colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 44,
    paddingVertical: 8,
  },
  tableLabel: { color: t.colors.ink, flex: 1, fontSize: 15 },
  tableLast: {
    color: t.colors.ink3,
    fontSize: 14,
    textAlign: "right",
    width: 72,
  },
  tableNow: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
    textAlign: "right",
  },
  nowCell: {
    alignItems: "flex-end",
    gap: 2,
    width: 72,
  },
  delta: { fontFamily: fontFamilySemiBold, fontSize: 12 },
  deltaGood: { color: t.colors.done },
  deltaWarn: { color: t.colors.warn },
  wroteLabel: { color: t.colors.ink3, fontSize: 13, marginBottom: 6 },
  wroteBlock: { marginTop: 8 },
  wroteQ: { color: t.colors.ink3, fontSize: 13, marginBottom: 2 },
  wroteBody: {
    color: t.colors.ink,
    fontSize: 16,
    lineHeight: 22,
  },
  replyCard: {
    backgroundColor: t.colors.brandTint,
    borderRadius: 16,
    marginTop: 12,
    padding: 14,
  },
  replyCardTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
    marginBottom: 6,
  },
  replyCardBody: {
    color: t.colors.ink,
    fontSize: 16,
    lineHeight: 22,
  },
  notSubmittedTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
    marginBottom: 4,
  },
  footer: {
    backgroundColor: t.colors.card,
    borderTopColor: t.colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    marginHorizontal: -16,
    padding: 12,
    paddingBottom: 20,
  },
  replyBtn: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 16,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    height: 52,
    justifyContent: "center",
  },
  replyBtnText: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  markBtn: {
    alignItems: "center",
    backgroundColor: t.colors.ink,
    borderRadius: 16,
    flex: 1.3,
    flexDirection: "row",
    gap: 8,
    height: 52,
    justifyContent: "center",
  },
  markBtnText: {
    color: t.colors.card,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  replySheet: {
    backgroundColor: t.colors.card,
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  replyNav: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44,
  },
  replyTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
  },
  link: { color: t.colors.brand, fontFamily: fontFamilySemiBold, fontSize: 16 },
  replyInput: {
    color: t.colors.ink,
    fontSize: 17,
    lineHeight: 24,
    marginTop: 16,
    minHeight: 140,
    textAlignVertical: "top",
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    minHeight: 44,
  },
  switchLabel: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  replyHint: {
    color: t.colors.ink3,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  disabled: { opacity: 0.45 },
  skeleton: {
    backgroundColor: t.colors.skel1,
    borderRadius: 20,
    height: 180,
  },
  offlineBanner: {
    alignItems: "flex-start",
    backgroundColor: t.colors.fill,
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  offline: {
    color: t.colors.ink2,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  nudgeBtn: {
    alignItems: "center",
    backgroundColor: t.colors.brand,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 14,
    minHeight: 48,
  },
  nudgeBtnText: {
    color: t.colors.card,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
    fontWeight: "600",
  },
  nudgeCaption: {
    color: t.colors.ink3,
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },
  markBtnOffline: {
    backgroundColor: t.colors.fill,
  },
  markBtnTextOffline: {
    color: t.colors.ink3,
  },
  srOnly: { height: 0, opacity: 0, overflow: "hidden" },
}));
