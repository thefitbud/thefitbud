import { useEffect, useState, type ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Check, ChevronLeft, ChevronRight, Ellipsis } from "lucide-react-native";
import type {
  AttentionGroupsResponse,
  ExceptionDetail,
  MealAssignment,
  WorkoutAssignment,
} from "@fitbud/contracts";
import { formatPersonName } from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { BottomSheet } from "../components/BottomSheet";
import { Button } from "../components/Button";
import { StatusChip } from "../components/StatusChip";
import { Text } from "../components/Text";
import { initialsFromName } from "../components/m2";
import { plannedRowsFromAssignment } from "../lib/plannedMealItems";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../providers/ThemeProvider";
import { formatAttentionAge } from "./attentionCards";
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
  reviewSheetAllResolved,
  reviewSheetAllResolvedLeaveLine,
  reviewSheetAllResolvedTitle,
  reviewSheetAllReviewed,
  reviewSheetDashStates,
  reviewSheetFooterMode,
  reviewSheetItemDate,
  reviewSheetItemOutcome,
  reviewSheetItemReviewed,
  reviewSheetNextClientLabel,
  reviewSheetNextItemLabel,
  reviewSheetResolvedBanner,
  reviewSheetResolvedRowLabel,
  reviewSheetStepLabel,
  type ReviewSheetDashState,
} from "./reviewSheetNav";
import { isNudgeableExceptionType } from "./sheets/nudgeContent";

type AttentionGroupItem =
  AttentionGroupsResponse["groups"][number]["items"][number];

type ClientMeta = {
  goalShort: string | null;
  weekNumber: number | null;
  timeZone: string | null;
};

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
  onMarkReviewed: (exceptionId: string) => void;
  onUndo: (exceptionId: string) => void;
  onNextClient: () => void;
  /** The FitBud nudge sheet for this item (never WhatsApp; that is in ⋯). */
  onNudge: (detail: ExceptionDetail, clientTimeZone: string | null) => void;
  /** The TM-04d resolve sheet for this item. */
  onResolve: (item: AttentionGroupItem) => void;
  /** The TM-04j ⋯ menu for this client. */
  onMore: () => void;
  /** Sheets opened from this one (nudge, resolve, ⋯, note), stacked over it. */
  children?: ReactNode;
};

/**
 * Needs you review sheet (frame 31, wired by Z12-51): one client's open items
 * with Mark reviewed, Nudge…, Resolve… and ⋯. Resolved items stay on the
 * sheet (read only) for this session, then the all-resolved summary shows.
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
  onMarkReviewed,
  onUndo,
  onNextClient,
  onNudge,
  onResolve,
  onMore,
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
  const allResolved = reviewSheetAllResolved(items);
  const returnToSummary =
    allReviewed && browsingItem && !canGoNextReviewSheet(index, total);
  const canPrev = showSummary ? total > 0 : canGoPrevReviewSheet(index);
  const canNext = showSummary
    ? Boolean(nextClientName)
    : canGoNextReviewSheet(index, total) || returnToSummary;
  const dashes = reviewSheetDashStates(index, total, reviewedFlags);
  const label = reviewSheetStepLabel(index, total, showSummary);
  const firstName = name.split(" ")[0] || name;
  const nextClientLabel = nextClientName
    ? reviewSheetNextClientLabel(formatPersonName(nextClientName))
    : null;
  const nextItemLabel =
    item && mode === "resolved" ? reviewSheetNextItemLabel(index, total) : null;
  const nextStepLabel = showSummary
    ? (nextClientLabel ?? "Next client")
    : returnToSummary
      ? "Done"
      : "Next item";
  const itemResolved = item?.status === "resolved";
  const itemReviewed = item?.status === "acknowledged";
  const nudgeable = item ? isNudgeableExceptionType(item.type) : false;

  const [clientMeta, setClientMeta] = useState<ClientMeta>({
    goalShort: null,
    weekNumber: null,
    timeZone: null,
  });
  const [card, setCard] = useState<ReviewSheetCardModel | null>(null);
  const [detail, setDetail] = useState<ExceptionDetail | null>(null);
  const [cardLoading, setCardLoading] = useState(false);

  useEffect(() => {
    if (!visible || !relationshipId) return;
    let cancelled = false;
    void (async () => {
      try {
        const workspace = await api.getClientWorkspace(relationshipId);
        if (cancelled) return;
        setClientMeta({
          goalShort: workspace.header.goalShort ?? null,
          weekNumber: coachingWeekNumber(workspace.header.startedAt),
          timeZone: workspace.header.traineeTimezone ?? null,
        });
      } catch {
        // The subtitle and clock times are context: without them the sheet
        // shows the item and its actions, and nothing claims a cause.
        if (!cancelled) {
          setClientMeta({ goalShort: null, weekNumber: null, timeZone: null });
        }
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
    setCardLoading(true);
    setDetail((current) => (current?.id === item.id ? current : null));
    void (async () => {
      let loaded: ExceptionDetail | null = null;
      let workout: WorkoutAssignment | null = null;
      let meal: MealAssignment | null = null;
      try {
        loaded = await api.getException(item.id);
      } catch {
        // A resolved item may already be gone for this trainer; the card
        // falls back to the item's own summary below.
        loaded = null;
      }
      if (loaded?.sourceEntityType === "workout_assignment") {
        try {
          workout = await api.getWorkoutAssignment(loaded.sourceEntityId);
        } catch {
          workout = null;
        }
      } else if (loaded?.sourceEntityType === "meal_assignment") {
        try {
          meal = await api.getMealAssignment(loaded.sourceEntityId);
        } catch {
          meal = null;
        }
      }
      if (cancelled) return;
      setDetail(loaded);
      if (!loaded) {
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
        return;
      }
      const mealKcalSum = meal
        ? plannedRowsFromAssignment(meal).reduce(
            (sum, row) => sum + (row.kcalPreview ?? 0),
            0,
          )
        : 0;
      const mealKcal = mealKcalSum > 0 ? mealKcalSum : null;
      setCard(
        buildReviewSheetCardModel({
          detail: loaded,
          ageMinutes: item.ageMinutes,
          workout,
          meal,
          mealKcal,
          timeZone: clientMeta.timeZone ?? undefined,
        }),
      );
      setCardLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // `item` changes identity on every list update; the fetch follows its id.
  }, [api, clientMeta.timeZone, itemId, relationshipId, visible]);

  const subtitle = reviewSheetClientSubtitle({
    goalShort: clientMeta.goalShort,
    weekNumber: clientMeta.weekNumber,
    openCount: items.filter((entry) => entry.status !== "resolved").length,
  });
  const actionsDisabled = offline || acting;
  const canNudgeNow = Boolean(detail && detail.id === item?.id) && !actionsDisabled;

  return (
    <BottomSheet visible={visible} headerless onDismiss={onDismiss}>
      <View style={styles.header}>
        <View style={styles.identity}>
          <View style={styles.avatar} accessibilityLabel={name}>
            <Text style={styles.avatarText}>{initialsFromName(name)}</Text>
          </View>
          <View style={styles.identityText}>
            <Text variant="headline">{name}</Text>
            <Text variant="caption">{subtitle}</Text>
          </View>
        </View>
        {!showSummary && item && !offline ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More actions"
            onPress={onMore}
            style={styles.moreBtn}
            testID="review-sheet-more"
          >
            <Ellipsis size={20} color={c.ink} strokeWidth={2} />
          </Pressable>
        ) : null}
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
        <View style={styles.card}>
          <View style={styles.cardMeta}>
            <StatusChip kind="severity" value={card.severity} />
            <Text variant="caption">{formatAttentionAge(card.ageMinutes)}</Text>
          </View>
          <Text variant="headline">{card.title}</Text>
          {card.body ? (
            <Text variant="subhead" tone="ink2">
              {card.body}
            </Text>
          ) : null}
          <View style={styles.kv}>
            <KvRow label="Planned" value={card.planned ?? "—"} />
            <KvRow label="Logged" value={card.logged} />
            <KvRow label="Reminder" value={card.reminder ?? "—"} />
          </View>
        </View>
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

      {item && mode === "actions" ? (
        <View style={styles.actionsRow}>
          {nudgeable ? (
            <Button
              label="Nudge…"
              variant="secondary"
              disabled={!canNudgeNow}
              onPress={() => {
                if (detail) onNudge(detail, clientMeta.timeZone);
              }}
              style={styles.half}
              testID="review-sheet-nudge"
            />
          ) : null}
          <Button
            label="Mark reviewed"
            variant="tint"
            disabled={actionsDisabled}
            loading={acting}
            onPress={() => onMarkReviewed(item.id)}
            style={styles.half}
            testID="review-sheet-mark-reviewed"
          />
        </View>
      ) : null}

      {item && (mode === "actions" || (mode === "resolved" && itemReviewed)) ? (
        <Button
          label="Resolve…"
          variant="primary"
          disabled={actionsDisabled}
          onPress={() => onResolve(item)}
          style={styles.resolveBtn}
          testID="review-sheet-resolve"
        />
      ) : null}

      {item && mode === "resolved" ? (
        <DoneBanner
          status={item.status}
          outcome={reviewSheetItemOutcome(item.details)}
          justNow={justResolvedIds.includes(item.id)}
          disabled={actionsDisabled}
          onUndo={itemReviewed ? () => onUndo(item.id) : undefined}
        />
      ) : null}

      {item && mode === "resolved" && itemReviewed && nudgeable ? (
        <Button
          label="Nudge…"
          variant="secondary"
          disabled={!canNudgeNow}
          onPress={() => {
            if (detail) onNudge(detail, clientMeta.timeZone);
          }}
          style={styles.resolveBtn}
          testID="review-sheet-nudge"
        />
      ) : null}

      {nextItemLabel ? (
        <ChevronPrimaryButton
          label={nextItemLabel}
          disabled={acting}
          onPress={() => onChangeIndex(index + 1)}
          testID="review-sheet-next-item"
          style={styles.nextItemBtn}
        />
      ) : null}

      {(mode === "actions" || mode === "resolved") && !itemResolved ? (
        <Text variant="caption" style={styles.helper}>
          Mark reviewed keeps {firstName} in Reviewed until every item is
          resolved.
        </Text>
      ) : null}

      {showSummary ? (
        <View testID="review-sheet-all-resolved">
          <View style={styles.doneMark}>
            <Check color={c.done} size={28} strokeWidth={2.5} />
          </View>
          <Text variant="title" style={styles.center}>
            {reviewSheetAllResolvedTitle(total, firstName, allResolved)}
          </Text>
          <Text variant="body" tone="ink3" style={[styles.center, styles.doneLeave]}>
            {reviewSheetAllResolvedLeaveLine(firstName, allResolved)}
          </Text>
          <View style={styles.doneList}>
            {items.map((entry) => {
              const when = reviewSheetItemDate(entry.details);
              return (
                <View key={entry.id} style={styles.doneRow}>
                  <Text variant="body" tone="ink3" style={styles.doneWhen} numberOfLines={1}>
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

function KvRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.kvRow}>
      <Text variant="subhead" tone="ink3" style={styles.kvLabel}>
        {label}
      </Text>
      <Text variant="subhead" tone="ink" style={styles.kvValue}>
        {value}
      </Text>
    </View>
  );
}

function DoneBanner({
  status,
  outcome,
  justNow,
  disabled,
  onUndo,
}: {
  status: string;
  outcome: string | null;
  justNow: boolean;
  disabled: boolean;
  onUndo?: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const resolved = status === "resolved";
  const banner = reviewSheetResolvedBanner(outcome, justNow, status);
  const ink = resolved ? theme.colors.done : theme.colors.ink2;
  return (
    <View
      style={[
        styles.resolvedBanner,
        { backgroundColor: resolved ? theme.colors.doneTint : theme.colors.fill },
      ]}
      accessibilityLabel={banner}
      testID="review-sheet-resolved-banner"
    >
      <Check color={ink} size={16} strokeWidth={2.5} />
      <Text variant="body" style={[styles.resolvedBannerText, { color: ink }]}>
        {banner}
      </Text>
      {onUndo ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Undo"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onUndo}
          style={styles.undoHit}
          testID="review-sheet-undo"
        >
          <Text
            variant="bodyStrong"
            style={[{ color: ink }, disabled ? styles.undoDisabled : null]}
          >
            Undo
          </Text>
        </Pressable>
      ) : null}
    </View>
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
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: t.colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: t.colors.brandInk,
    fontSize: 13,
    fontWeight: "600",
  },
  identityText: { flex: 1, minWidth: 0, gap: 2 },
  moreBtn: {
    width: t.touchTarget,
    height: t.touchTarget,
    borderRadius: 999,
    backgroundColor: t.colors.fill,
    alignItems: "center",
    justifyContent: "center",
  },
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
  card: {
    backgroundColor: t.colors.card,
    borderWidth: 1,
    borderColor: t.colors.line2,
    borderRadius: t.radii.card,
    padding: t.spacing.md,
    gap: t.spacing.sm,
    marginBottom: t.spacing.sm,
  },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: t.spacing.sm },
  kv: { marginTop: t.spacing.xs, gap: 6 },
  kvRow: { flexDirection: "row", gap: t.spacing.md },
  kvLabel: { width: 96 },
  kvValue: { flex: 1 },
  empty: { marginBottom: t.spacing.md },
  actionsRow: { flexDirection: "row", gap: t.spacing.sm, marginTop: t.spacing.xs },
  half: { flex: 1 },
  resolveBtn: { marginTop: t.spacing.sm },
  helper: { textAlign: "center", marginTop: t.spacing.sm },
  resolvedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.spacing.sm,
    borderRadius: 12,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    marginTop: t.spacing.xs,
  },
  resolvedBannerText: { flex: 1 },
  undoHit: { minHeight: t.touchTarget, justifyContent: "center", paddingLeft: t.spacing.sm },
  undoDisabled: { opacity: 0.4 },
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
  nextItemBtn: { marginTop: t.spacing.sm },
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
