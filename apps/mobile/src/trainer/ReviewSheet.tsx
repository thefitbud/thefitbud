import { Pressable, StyleSheet, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import type { AttentionGroupsResponse } from "@fitbud/contracts";
import { formatPersonName, labelFor } from "@fitbud/core";
import {
  colors,
  fontFamilyMedium,
  fontFamilySemiBold,
  radii,
  semanticColors,
  spacing,
} from "@fitbud/ui-mobile";
import { BottomSheet } from "../components/BottomSheet";
import { Button } from "../components/Button";
import { StatusChip } from "../components/StatusChip";
import { Text } from "../components/Text";
import { initialsFromName } from "../components/m2";
import { formatAttentionAge } from "./attentionCards";
import {
  canGoNextReviewSheet,
  canGoPrevReviewSheet,
  reviewSheetDashStates,
  reviewSheetItemLabel,
  reviewSheetOpenItemsLine,
  type ReviewSheetDashState,
} from "./reviewSheetNav";

type AttentionGroupItem =
  AttentionGroupsResponse["groups"][number]["items"][number];

type Props = {
  visible: boolean;
  traineeDisplayName: string;
  items: ReadonlyArray<AttentionGroupItem>;
  index: number;
  offline?: boolean;
  acting?: boolean;
  onChangeIndex: (next: number) => void;
  onDismiss: () => void;
  onMarkReviewed: (exceptionId: string) => void;
  onNudge: () => void;
  /** Resolve opens a later F1f sub-sheet; for F1d this is a no-op hook. */
  onResolve?: (exceptionId: string) => void;
};

export function ReviewSheet({
  visible,
  traineeDisplayName,
  items,
  index,
  offline = false,
  acting = false,
  onChangeIndex,
  onDismiss,
  onMarkReviewed,
  onNudge,
  onResolve,
}: Props) {
  const total = items.length;
  const item = items[index] ?? null;
  const name = formatPersonName(traineeDisplayName);
  const canPrev = canGoPrevReviewSheet(index);
  const canNext = canGoNextReviewSheet(index, total);
  const dashes = reviewSheetDashStates(index, total);
  const label = reviewSheetItemLabel(index, total);
  const firstName = name.split(" ")[0] || name;
  const unreviewed =
    item?.status === "detected" || item?.status === "active";

  return (
    <BottomSheet visible={visible} headerless onDismiss={onDismiss}>
      <View style={styles.header}>
        <View style={styles.identity}>
          <View style={styles.avatar} accessibilityLabel={name}>
            <Text style={styles.avatarText}>{initialsFromName(name)}</Text>
          </View>
          <View style={styles.identityText}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.subtitle}>
              {reviewSheetOpenItemsLine(total)}
            </Text>
          </View>
        </View>
        <View style={styles.stepper} accessibilityLabel={`Item ${label}`}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous item"
            accessibilityState={{ disabled: !canPrev }}
            disabled={!canPrev}
            onPress={() => onChangeIndex(index - 1)}
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
            accessibilityLabel="Next item"
            accessibilityState={{ disabled: !canNext }}
            disabled={!canNext}
            onPress={() => onChangeIndex(index + 1)}
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
          now: Math.min(index + 1, Math.max(total, 1)),
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

      {item ? (
        <View style={styles.card}>
          <View style={styles.cardMeta}>
            <StatusChip kind="severity" value={item.severity} />
            <Text style={styles.age}>{formatAttentionAge(item.ageMinutes)}</Text>
          </View>
          <Text style={styles.summary}>{item.summary}</Text>
          <Text style={styles.detail}>
            {labelFor("exception_status", item.status)} ·{" "}
            {labelFor("exception_type", item.type)}
          </Text>
        </View>
      ) : (
        <Text style={styles.empty}>No open items to review.</Text>
      )}

      {item && unreviewed ? (
        <>
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
          <Button
            label="Resolve…"
            variant="primary"
            disabled={offline || acting}
            onPress={() => onResolve?.(item.id)}
          />
          <Text style={styles.helper}>
            Mark reviewed keeps {firstName} in Reviewed until every item is
            resolved.
          </Text>
        </>
      ) : null}

      {item && !unreviewed ? (
        <Text style={styles.helper}>
          Already reviewed. Resolve is coming in a follow-up.
        </Text>
      ) : null}
    </BottomSheet>
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
  detail: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
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
});
