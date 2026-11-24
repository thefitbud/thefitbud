import { useEffect, useState, type ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Check, ChevronLeft, ChevronRight } from "lucide-react-native";
import type {
  AttentionGroupsResponse,
  ExceptionDetail,
} from "@fitbud/contracts";
import { formatPersonName } from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { BottomSheet } from "../components/BottomSheet";
import { Button } from "../components/Button";
import { Text } from "../components/Text";
import { plannedRowsFromAssignment } from "../lib/plannedMealItems";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../providers/ThemeProvider";
import { ClientAvatar, ClientNameLink } from "./ClientAvatar";
import { ReviewActions } from "./review/ReviewActions";
import { ReviewCard } from "./review/ReviewCard";
import {
  buildReviewSheetCardModel,
  coachingWeekNumber,
  reviewSheetCardTitle,
  reviewSheetClientSubtitle,
  type ReviewSheetCardModel,
} from "./reviewSheetContent";
import {
  REVIEW_SHEET_BACK_LABEL,
  canGoNextReviewSheet,
  canGoPrevReviewSheet,
  reviewSheetAllResolvedTitle,
  reviewSheetSummaryLine,
  reviewSheetAllReviewed,
  reviewSheetDashStates,
  reviewSheetFooterMode,
  reviewSheetItemDate,
  reviewSheetItemOutcome,
  reviewSheetItemReviewed,
  reviewSheetNextClientLabel,
  reviewSheetResolvedBanner,
  reviewSheetResolvedRowLabel,
  reviewSheetStepLabel,
  type ReviewSheetDashState,
} from "./reviewSheetNav";
import {
  clientMetaFromWorkspaceHeader,
  readClientMeta,
  trainerCacheEpoch,
  writeClientMeta,
} from "./cache";
import {
  loadReviewItem,
  prefetchReviewItem,
  readReviewItem,
  type ReviewItemBundle,
} from "./reviewItemCache";
import { isNudgeableExceptionType } from "./sheets/nudgeContent";

type AttentionGroupItem =
  AttentionGroupsResponse["groups"][number]["items"][number];

type ClientMeta = {
  goalShort: string | null;
  weekNumber: number | null;
  timeZone: string | null;
};

function metaFromCache(relationshipId: string | null): ClientMeta {
  const cached = relationshipId ? readClientMeta(relationshipId) : null;
  return {
    goalShort: cached?.goalShort ?? null,
    weekNumber: cached?.startedAt
      ? coachingWeekNumber(cached.startedAt)
      : (cached?.week ?? null),
    timeZone: cached?.timeZone ?? null,
  };
}

type Props = {
  visible: boolean;
  relationshipId: string | null;
  traineeDisplayName: string;
  items: ReadonlyArray<AttentionGroupItem>;
  index: number;
  offline?: boolean;
  acting?: boolean;
  /** Step back from the all-resolved summary onto an item (Undo). */
  browsingItem?: boolean;
  /** Marked reviewed or resolved in this session — banner reads "just now". */
  justResolvedIds?: ReadonlyArray<string>;
  /** Next Needs you client, when one remains. */
  nextClientName?: string | null;
  onChangeIndex: (next: number) => void;
  onBrowseItem: (index: number) => void;
  onShowSummary: () => void;
  onDismiss: () => void;
  /** "Noted, keep open": the existing acknowledge. */
  onNoted: (exceptionId: string) => void;
  onUndo: (exceptionId: string) => void;
  onNextClient: () => void;
  /** The FitBud reminder sheet for this item (never WhatsApp). */
  onNudge: (detail: ExceptionDetail, clientTimeZone: string | null) => void;
  /** The TM-04d resolve sheet for this item. */
  onResolve: (item: AttentionGroupItem) => void;
  /** The note sheet for this client. */
  onAddNote: () => void;
  /** A wa.me chat with no template; the trainer sends it. */
  onWhatsApp: () => void;
  /** The client's profile (avatar and name). */
  onOpenProfile?: (() => void) | undefined;
  /** Sheets opened from this one (remind, resolve, note), stacked over it. */
  children?: ReactNode;
};

/**
 * Attention review sheet (RP-01…RP-05, D-W14-29): one client's open items
 * with Remind, Noted keep open and Resolve…, moved between only by the
 * "1 of 3" stepper. Resolved items stay on the sheet (read only) for this
 * session, then the all-done summary shows.
 * The sheet follows the system theme itself.
 */
export function ReviewSheet(props: Props) {
  return (
    <ThemeScope scheme="system" drivesSystemBars={false}>
      <ReviewSheetBody {...props} />
    </ThemeScope>
  );
}

function ReviewSheetBody({
  visible,
  relationshipId,
  traineeDisplayName,
  items,
  index,
  offline = false,
  acting = false,
  browsingItem = false,
  justResolvedIds = [],
  nextClientName = null,
  onChangeIndex,
  onBrowseItem,
  onShowSummary,
  onDismiss,
  onNoted,
  onUndo,
  onNextClient,
  onNudge,
  onResolve,
  onAddNote,
  onWhatsApp,
  onOpenProfile,
  children,
}: Props) {
  const { api } = useAuth();
  const theme = useTheme();
  const styles = useStyles();
  const c = theme.colors;
  const total = items.length;
  const item = items[index] ?? null;
  const name = formatPersonName(traineeDisplayName);
  const mode = reviewSheetFooterMode(items, index, browsingItem);
  const showSummary = mode === "all_resolved";
  const reviewedFlags = items.map((entry) =>
    reviewSheetItemReviewed(entry.status),
  );
  const allReviewed = reviewSheetAllReviewed(items);
  const returnToSummary =
    allReviewed && browsingItem && !canGoNextReviewSheet(index, total);
  const canPrev = showSummary ? total > 0 : canGoPrevReviewSheet(index);
  // The stepper is the only way between items; on the summary it has nowhere
  // further to go (Next client is its own button, RP-05).
  const canNext = showSummary
    ? false
    : canGoNextReviewSheet(index, total) || returnToSummary;
  const dashes = reviewSheetDashStates(index, total, reviewedFlags);
  const label = reviewSheetStepLabel(index, total, showSummary);
  const firstName = name.split(" ")[0] || name;
  const nextClientLabel = nextClientName
    ? reviewSheetNextClientLabel(formatPersonName(nextClientName))
    : null;
  const nextStepLabel = returnToSummary ? "Done" : "Next item";
  const itemResolved = item?.status === "resolved";
  const itemReviewed = item?.status === "acknowledged";
  const nudgeable = item ? isNudgeableExceptionType(item.type) : false;

  // Z14-3: the header paints from the per-client cache at once; the workspace
  // read below only fills what the cache lacks.
  const [clientMeta, setClientMeta] = useState<ClientMeta>(() =>
    metaFromCache(relationshipId),
  );
  const [card, setCard] = useState<ReviewSheetCardModel | null>(null);
  const [detail, setDetail] = useState<ExceptionDetail | null>(null);
  const [cardLoading, setCardLoading] = useState(false);

  useEffect(() => {
    if (!visible || !relationshipId) return;
    let cancelled = false;
    const cached = readClientMeta(relationshipId);
    setClientMeta(metaFromCache(relationshipId));
    // A full entry (it has the time zone, which only a workspace read stores)
    // needs no read: the sheet never waits on the whole workspace.
    if (cached && cached.timeZone != null) return;
    const epoch = trainerCacheEpoch();
    void (async () => {
      try {
        const workspace = await api.getClientWorkspace(relationshipId);
        writeClientMeta(
          relationshipId,
          clientMetaFromWorkspaceHeader(workspace.header),
          epoch,
        );
        if (cancelled) return;
        setClientMeta({
          goalShort: workspace.header.goalShort ?? null,
          weekNumber: coachingWeekNumber(workspace.header.startedAt),
          timeZone: workspace.header.traineeTimezone ?? null,
        });
      } catch {
        // The subtitle and clock times are context: without them the sheet
        // shows the item and its actions, and nothing claims a cause.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, relationshipId, visible]);

  const itemId = item?.id ?? null;
  useEffect(() => {
    if (!visible || !item) {
      setCard(null);
      setDetail(null);
      return;
    }
    let cancelled = false;
    const timeZone = clientMeta.timeZone ?? undefined;
    const showBundle = (bundle: ReviewItemBundle) => {
      const mealKcalSum = bundle.meal
        ? plannedRowsFromAssignment(bundle.meal).reduce(
            (sum, row) => sum + (row.kcalPreview ?? 0),
            0,
          )
        : 0;
      setDetail(bundle.detail);
      setCard(
        buildReviewSheetCardModel({
          detail: bundle.detail,
          ageMinutes: item.ageMinutes,
          workout: bundle.workout,
          meal: bundle.meal,
          mealKcal: mealKcalSum > 0 ? mealKcalSum : null,
          timeZone,
        }),
      );
      setCardLoading(false);
    };
    // A seen or prefetched item shows at once (Z14-3); a stale one refreshes
    // underneath.
    const kept = readReviewItem(item.id);
    if (kept) {
      showBundle(kept.bundle);
      if (!kept.stale) return;
    } else {
      setCardLoading(true);
      setDetail((current) => (current?.id === item.id ? current : null));
    }
    void loadReviewItem(api, item.id, (loadedDetail) => {
      // The exception is in: paint the card now; the Planned row follows.
      if (cancelled || kept) return;
      showBundle({ detail: loadedDetail, workout: null, meal: null });
    }).then((bundle) => {
      if (cancelled) return;
      if (bundle) {
        showBundle(bundle);
        return;
      }
      if (kept) return;
      // A resolved item may already be gone for this trainer; the card
      // falls back to the item's own summary.
      setDetail(null);
      const localDate =
        typeof item.details?.localDate === "string"
          ? item.details.localDate
          : null;
      setCard({
        title: reviewSheetCardTitle({
          type: item.type,
          localDate,
          summary: item.summary,
        }),
        body: null,
        planned: null,
        logged: "Nothing logged",
        reminder: null,
        localDate,
        severity: item.severity,
        ageMinutes: item.ageMinutes,
      });
      setCardLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // `item` changes identity on every list update; the fetch follows its id.
  }, [api, clientMeta.timeZone, itemId, relationshipId, visible]);

  // Prefetch the next item while this one is read, so stepping on is instant.
  const nextItemId = items[index + 1]?.id ?? null;
  useEffect(() => {
    if (!visible || !nextItemId) return;
    prefetchReviewItem(api, nextItemId);
  }, [api, nextItemId, visible]);

  const subtitle = reviewSheetClientSubtitle({
    goalShort: clientMeta.goalShort,
    weekNumber: clientMeta.weekNumber,
    openCount: items.filter((entry) => entry.status !== "resolved").length,
  });
  const actionsDisabled = offline || acting;
  const canNudgeNow =
    Boolean(detail && detail.id === item?.id) && !actionsDisabled;

  return (
    <BottomSheet visible={visible} headerless onDismiss={onDismiss}>
      <View style={styles.header}>
        <View style={styles.identity}>
          <ClientAvatar
            name={name}
            size={40}
            fontSize={13}
            fontWeight="600"
            tone={{ backgroundColor: c.brandTint, color: c.brandInk }}
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
            <Text variant="caption">{subtitle}</Text>
          </View>
        </View>
        <View style={styles.stepper} accessibilityLabel={`Item ${label}`}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous item"
            accessibilityState={{ disabled: !canPrev }}
            disabled={!canPrev}
            onPress={() => {
              if (showSummary) onBrowseItem(index);
              else onChangeIndex(index - 1);
            }}
            style={styles.stepBtn}
          >
            <ChevronLeft
              color={canPrev ? c.ink : c.ink4}
              size={18}
              strokeWidth={1.75}
            />
          </Pressable>
          <Text variant="bodyStrong" tone="ink2" style={styles.stepLabel}>
            {label}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={nextStepLabel}
            accessibilityState={{ disabled: !canNext }}
            disabled={!canNext}
            onPress={() => {
              if (showSummary) onNextClient();
              else if (returnToSummary) onShowSummary();
              else onChangeIndex(index + 1);
            }}
            style={styles.stepBtn}
          >
            <ChevronRight
              color={canNext ? c.ink : c.ink4}
              size={18}
              strokeWidth={1.75}
            />
          </Pressable>
        </View>
      </View>

      <View
        style={styles.dashes}
        accessibilityRole="progressbar"
        accessibilityValue={{
          min: 1,
          max: Math.max(total, 1),
          now: showSummary
            ? Math.max(total, 1)
            : Math.min(index + 1, Math.max(total, 1)),
        }}
        accessibilityLabel={`Progress ${label}`}
      >
        {dashes.map((state, i) => (
          <View
            key={`dash-${i}`}
            style={[styles.dash, dashStyle(styles, state)]}
            testID={`review-sheet-dash-${i}-${state}`}
          />
        ))}
      </View>

      {item && !showSummary && card ? (
        <ReviewCard card={card} noted={itemReviewed} resolved={itemResolved} />
      ) : item && !showSummary && cardLoading ? (
        <Text variant="body" tone="ink3" style={styles.empty}>
          Loading item…
        </Text>
      ) : null}

      {mode === "empty" ? (
        <Text variant="body" tone="ink3" style={styles.empty}>
          No open items to review.
        </Text>
      ) : null}

      {item && (mode === "actions" || mode === "resolved") ? (
        <ReviewActions
          state={itemResolved ? "resolved" : itemReviewed ? "noted" : "open"}
          firstName={firstName}
          remindable={nudgeable}
          disabled={actionsDisabled}
          acting={acting}
          stateLine={
            mode === "resolved"
              ? reviewSheetResolvedBanner(
                  reviewSheetItemOutcome(item.details),
                  justResolvedIds.includes(item.id),
                  item.status,
                )
              : null
          }
          onRemind={() => {
            if (detail && canNudgeNow) onNudge(detail, clientMeta.timeZone);
          }}
          onNoted={() => onNoted(item.id)}
          onResolve={() => onResolve(item)}
          onUndo={itemReviewed ? () => onUndo(item.id) : undefined}
          onAddNote={onAddNote}
          onWhatsApp={onWhatsApp}
          testIdPrefix="review-sheet"
        />
      ) : null}

      {showSummary ? (
        <View testID="review-sheet-all-resolved">
          <View style={styles.doneMark}>
            <Check color={c.done} size={28} strokeWidth={2.5} />
          </View>
          <Text variant="title" style={styles.center}>
            {reviewSheetAllResolvedTitle(firstName)}
          </Text>
          <Text
            variant="body"
            tone="ink3"
            style={[styles.center, styles.doneLeave]}
          >
            {reviewSheetSummaryLine(items)}
          </Text>
          <View style={styles.doneList}>
            {items.map((entry) => {
              const when = reviewSheetItemDate(entry.details);
              return (
                <View key={entry.id} style={styles.doneRow}>
                  <Text
                    variant="body"
                    tone="ink3"
                    style={styles.doneWhen}
                    numberOfLines={1}
                  >
                    {when ?? entry.summary}
                  </Text>
                  <Text variant="bodyStrong" style={styles.doneOutcome}>
                    {reviewSheetResolvedRowLabel(
                      reviewSheetItemOutcome(entry.details),
                      entry.status,
                    )}
                  </Text>
                </View>
              );
            })}
          </View>
          <View style={styles.doneActions}>
            {nextClientLabel ? (
              <ChevronPrimaryButton
                label={nextClientLabel}
                onPress={onNextClient}
                testID="review-sheet-next-client"
              />
            ) : null}
            <Button
              label={REVIEW_SHEET_BACK_LABEL}
              variant="secondary"
              onPress={onDismiss}
              testID="review-sheet-back"
            />
          </View>
        </View>
      ) : null}
      {children}
    </BottomSheet>
  );
}

function ChevronPrimaryButton({
  label,
  disabled,
  onPress,
  testID,
  style,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[
        styles.primaryBtn,
        disabled ? styles.primaryBtnDisabled : null,
        style,
      ]}
    >
      <Text variant="bodyStrong" style={{ color: theme.colors.onBrand }}>
        {label}
      </Text>
      <ChevronRight color={theme.colors.onBrand} size={18} strokeWidth={2.25} />
    </Pressable>
  );
}

function dashStyle(
  styles: ReturnType<typeof useStyles>,
  state: ReviewSheetDashState,
) {
  if (state === "on") return styles.dashOn;
  if (state === "ok") return styles.dashOk;
  return null;
}

const useStyles = createThemedStyles((t) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.spacing.sm,
    marginBottom: t.spacing.xs,
  },
  identity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: t.spacing.md,
    minWidth: 0,
  },
  identityText: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  stepBtn: {
    width: t.touchTarget,
    height: t.touchTarget,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.colors.line2,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLabel: { minWidth: 48, textAlign: "center", fontSize: 13 },
  dashes: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginBottom: t.spacing.md,
    marginTop: t.spacing.xs,
  },
  dash: {
    width: 24,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.colors.fill2,
  },
  dashOn: { backgroundColor: t.colors.brand },
  dashOk: { backgroundColor: t.colors.done },
  empty: { marginBottom: t.spacing.md },
  primaryBtn: {
    minHeight: t.touchTarget,
    borderRadius: t.radii.button,
    backgroundColor: t.colors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.md,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  center: { textAlign: "center" },
  doneMark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: t.colors.doneTint,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: t.spacing.sm,
    marginBottom: t.spacing.md,
  },
  doneLeave: { marginTop: t.spacing.xs },
  doneList: { marginTop: t.spacing.lg, gap: t.spacing.md },
  doneRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: t.spacing.md,
  },
  doneWhen: { flexShrink: 1 },
  doneOutcome: { textAlign: "right" },
  doneActions: { gap: t.spacing.sm, marginTop: t.spacing.lg },
}));
