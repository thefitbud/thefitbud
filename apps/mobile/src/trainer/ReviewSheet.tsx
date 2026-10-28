import { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Check, ChevronLeft, ChevronRight } from "lucide-react-native";
import type {
  AttentionGroupsResponse,
  ExceptionDetail,
  MealAssignment,
  WorkoutAssignment,
} from "@fitbud/contracts";
import { formatPersonName } from "@fitbud/core";
import {
  colors,
  fontFamilyMedium,
  fontFamilySemiBold,
  radii,
  semanticColors,
  spacing,
  touchTargetMin,
} from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { BottomSheet } from "../components/BottomSheet";
import { Button } from "../components/Button";
import { StatusChip } from "../components/StatusChip";
import { Text } from "../components/Text";
import { initialsFromName } from "../components/m2";
import { plannedRowsFromAssignment } from "../lib/plannedMealItems";
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
  /** Mark reviewed in this session — banner reads "just now". */
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
  onNudge: () => void;
  /** Resolve opens a later F1f sub-sheet; for F1d this is a no-op hook. */
  onResolve?: (exceptionId: string) => void;
};

export function ReviewSheet({
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
}: Props) {
  const { api } = useAuth();
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

  const [clientMeta, setClientMeta] = useState<ClientMeta>({
    goalShort: null,
    weekNumber: null,
    timeZone: null,
  });
  const [card, setCard] = useState<ReviewSheetCardModel | null>(null);
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
        if (!cancelled) {
          setClientMeta({ goalShort: null, weekNumber: null, timeZone: null });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, relationshipId, visible]);

  useEffect(() => {
    if (!visible || !item) {
      setCard(null);
      return;
    }
    let cancelled = false;
    setCardLoading(true);
    void (async () => {
      let detail: ExceptionDetail | null = null;
      let workout: WorkoutAssignment | null = null;
      let meal: MealAssignment | null = null;
      try {
        detail = await api.getException(item.id);
      } catch {
        detail = null;
      }
      if (detail?.sourceEntityType === "workout_assignment") {
        try {
          workout = await api.getWorkoutAssignment(detail.sourceEntityId);
        } catch {
          workout = null;
        }
      } else if (detail?.sourceEntityType === "meal_assignment") {
        try {
          meal = await api.getMealAssignment(detail.sourceEntityId);
        } catch {
          meal = null;
        }
      }
      if (cancelled) return;
      if (!detail) {
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
          detail,
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
  }, [api, clientMeta.timeZone, item, relationshipId, visible]);

  const subtitle = reviewSheetClientSubtitle({
    goalShort: clientMeta.goalShort,
    weekNumber: clientMeta.weekNumber,
    openCount: total,
  });

  return (
    <BottomSheet visible={visible} headerless onDismiss={onDismiss}>
      <View style={styles.header}>
        <View style={styles.identity}>
          <View style={styles.avatar} accessibilityLabel={name}>
            <Text style={styles.avatarText}>{initialsFromName(name)}</Text>
          </View>
          <View style={styles.identityText}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
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
            style={[styles.stepBtn, !canPrev ? styles.stepBtnDisabled : null]}
          >
            <ChevronLeft
              color={canPrev ? colors.deepNavy : colors.lightGrey}
              size={18}
              strokeWidth={1.75}
            />
          </Pressable>
          <Text style={styles.stepLabel}>{label}</Text>
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
            style={[styles.stepBtn, !canNext ? styles.stepBtnDisabled : null]}
          >
            <ChevronRight
              color={canNext ? colors.deepNavy : colors.lightGrey}
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
            style={[styles.dash, dashStyle(state)]}
            testID={`review-sheet-dash-${i}-${state}`}
          />
        ))}
      </View>

      {item && !showSummary && card ? (
        <View style={styles.card}>
          <View style={styles.cardMeta}>
            <StatusChip kind="severity" value={card.severity} />
            <Text style={styles.age}>
              {formatAttentionAge(card.ageMinutes)}
            </Text>
          </View>
          <Text style={styles.summary}>{card.title}</Text>
          {card.body ? <Text style={styles.body}>{card.body}</Text> : null}
          <View style={styles.kv}>
            <KvRow label="Planned" value={card.planned ?? "—"} />
            <KvRow label="Logged" value={card.logged} />
            <KvRow label="Reminder" value={card.reminder ?? "—"} />
          </View>
        </View>
      ) : item && !showSummary && cardLoading ? (
        <Text style={styles.empty}>Loading item…</Text>
      ) : null}

      {mode === "empty" ? (
        <Text style={styles.empty}>No open items to review.</Text>
      ) : null}

      {item && mode === "actions" ? (
        <View style={styles.actionsRow}>
          <Button
            label="Nudge…"
            variant="secondary"
            disabled={offline || acting}
            onPress={onNudge}
            style={styles.half}
          />
          <Button
            label="Mark reviewed"
            variant="tinted"
            disabled={offline || acting}
            loading={acting}
            onPress={() => onMarkReviewed(item.id)}
            style={styles.half}
          />
        </View>
      ) : null}

      {item && mode === "actions" ? (
        <Button
          label="Resolve…"
          variant="primary"
          disabled={offline || acting}
          onPress={() => onResolve?.(item.id)}
        />
      ) : null}

      {item && mode === "resolved" ? (
        <ResolvedBanner
          outcome={reviewSheetItemOutcome(item.details)}
          justNow={justResolvedIds.includes(item.id)}
          disabled={offline || acting}
          onUndo={() => onUndo(item.id)}
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

      {mode === "actions" || mode === "resolved" ? (
        <Text style={styles.helper}>
          Mark reviewed keeps {firstName} in Reviewed until every item is
          resolved.
        </Text>
      ) : null}

      {showSummary ? (
        <View testID="review-sheet-all-resolved">
          <View style={styles.doneMark}>
            <Check
              color={semanticColors.positive.text}
              size={28}
              strokeWidth={2.5}
            />
          </View>
          <Text style={styles.doneTitle}>
            {reviewSheetAllResolvedTitle(total, firstName)}
          </Text>
          <Text style={styles.doneLeave}>
            {reviewSheetAllResolvedLeaveLine(firstName)}
          </Text>
          <View style={styles.doneList}>
            {items.map((entry) => {
              const when = reviewSheetItemDate(entry.details);
              return (
                <View key={entry.id} style={styles.doneRow}>
                  <Text style={styles.doneWhen} numberOfLines={1}>
                    {when ?? entry.summary}
                  </Text>
                  <Text style={styles.doneOutcome}>
                    {reviewSheetResolvedRowLabel(
                      reviewSheetItemOutcome(entry.details),
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
    </BottomSheet>
  );
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

function ResolvedBanner({
  outcome,
  justNow,
  disabled,
  onUndo,
}: {
  outcome: string | null;
  justNow: boolean;
  disabled: boolean;
  onUndo: () => void;
}) {
  const banner = reviewSheetResolvedBanner(outcome, justNow);
  return (
    <View
      style={styles.resolvedBanner}
      accessibilityLabel={banner}
      testID="review-sheet-resolved-banner"
    >
      <Check
        color={semanticColors.positive.text}
        size={16}
        strokeWidth={2.5}
      />
      <Text style={styles.resolvedBannerText}>{banner}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Undo"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onUndo}
        testID="review-sheet-undo"
      >
        <Text style={[styles.undo, disabled ? styles.undoDisabled : null]}>
          Undo
        </Text>
      </Pressable>
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
      <Text style={styles.primaryBtnText}>{label}</Text>
      <ChevronRight color={colors.white} size={18} strokeWidth={2.25} />
    </Pressable>
  );
}

function dashStyle(state: ReviewSheetDashState) {
  if (state === "on") return styles.dashOn;
  if (state === "ok") return styles.dashOk;
  return null;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  identity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minWidth: 0,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.paleLavender,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.indigo,
    fontFamily: fontFamilySemiBold,
    fontSize: 13,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  subtitle: {
    color: colors.midGrey,
    fontFamily: fontFamilyMedium,
    fontSize: 12,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.lightGrey,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnDisabled: {
    opacity: 1,
  },
  stepLabel: {
    minWidth: 48,
    textAlign: "center",
    color: colors.darkGrey,
    fontFamily: fontFamilySemiBold,
    fontSize: 13,
  },
  dashes: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  dash: {
    width: 24,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lightGrey,
  },
  dashOn: {
    backgroundColor: colors.indigo,
  },
  dashOk: {
    backgroundColor: semanticColors.positive.text,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.lightGrey,
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  age: {
    color: colors.midGrey,
    fontSize: 12,
  },
  summary: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  body: {
    color: colors.darkGrey,
    fontFamily: fontFamilyMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  kv: {
    marginTop: spacing.xs,
    gap: 6,
  },
  kvRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  kvLabel: {
    width: 96,
    color: colors.midGrey,
    fontSize: 13,
  },
  kvValue: {
    flex: 1,
    color: colors.nearBlack,
    fontSize: 13,
  },
  empty: {
    color: colors.midGrey,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  half: {
    flex: 1,
  },
  helper: {
    color: colors.midGrey,
    fontSize: 12,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 16,
  },
  resolvedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: semanticColors.positive.fill,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  resolvedBannerText: {
    flex: 1,
    color: semanticColors.positive.text,
    fontFamily: fontFamilyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  undo: {
    color: semanticColors.positive.text,
    fontFamily: fontFamilySemiBold,
    fontSize: 14,
  },
  undoDisabled: {
    opacity: 0.4,
  },
  primaryBtn: {
    minHeight: touchTargetMin,
    borderRadius: radii.control,
    backgroundColor: colors.indigo,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: spacing.lg,
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    color: colors.white,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  nextItemBtn: {
    marginTop: spacing.sm,
  },
  doneMark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: semanticColors.positive.fill,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  doneTitle: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 20,
    lineHeight: 26,
    textAlign: "center",
  },
  doneLeave: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  doneList: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  doneRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  doneWhen: {
    flexShrink: 1,
    color: colors.midGrey,
    fontSize: 14,
  },
  doneOutcome: {
    color: colors.deepNavy,
    fontFamily: fontFamilyMedium,
    fontSize: 14,
    textAlign: "right",
  },
  doneActions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
