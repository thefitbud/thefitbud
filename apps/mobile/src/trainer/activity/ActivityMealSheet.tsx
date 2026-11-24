import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { NotebookPen, Pencil, RefreshCw } from "lucide-react-native";
import type { FitBudApiClient } from "@fitbud/api-client";
import type { MealAssignment } from "@fitbud/contracts";
import { formatCivilDate, formatClockTime, formatPersonName } from "@fitbud/core";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { reportError } from "../../lib/reportError";
import {
  activityTag,
  clientEditMarker,
  firstName,
  parseMealComplianceId,
  type ActivityEventLike,
} from "./model";
import { ThemeScope, createThemedStyles, useTheme } from "../../providers/ThemeProvider";

type Props = {
  visible: boolean;
  event: ActivityEventLike | null;
  api: FitBudApiClient;
  zone: string;
  onDismiss: () => void;
  onOpenClient: () => void;
  onAddNote: () => void;
};

/**
 * TM-09b: meal row sheet. Loads the assignment when the compliance id is on
 * the event; food PLAN/ATE line items wait on richer feed payloads (recorded
 * departure — mock shows a food table).
 */
export function ActivityMealSheet(props: Props) {
  return (
    <ThemeScope scheme="system" drivesSystemBars={false}>
      <ActivityMealSheetBody {...props} />
    </ThemeScope>
  );
}

function ActivityMealSheetBody({
  visible,
  event,
  api,
  zone,
  onDismiss,
  onOpenClient,
  onAddNote,
}: Props) {

  const theme = useTheme();
  const styles = useStyles();
  const [assignment, setAssignment] = useState<MealAssignment | null>(null);

  useEffect(() => {
    if (!visible || !event) {
      setAssignment(null);
      return;
    }
    const complianceId = parseMealComplianceId(event.id);
    if (!complianceId) {
      setAssignment(null);
      return;
    }
    let cancelled = false;
    void api
      .listMealAssignments(event.relationshipId, {
        fromDate: event.occurredAt.slice(0, 10),
        toDate: event.occurredAt.slice(0, 10),
      })
      .then((page) => {
        if (cancelled) return;
        const match =
          page.items.find((item) => item.compliance?.id === complianceId) ??
          null;
        setAssignment(match);
      })
      .catch((err: unknown) => {
        reportError("activity.mealSheet", err);
        if (!cancelled) setAssignment(null);
      });
    return () => {
      cancelled = true;
    };
  }, [api, event, visible]);

  if (!event) return null;

  const first = firstName(event.traineeDisplayName);
  const tag = activityTag(event);
  const mealName = assignment?.mealName ?? "Meal";
  const when = `${formatCivilDate(event.occurredAt.slice(0, 10))} ${formatClockTime(event.occurredAt, zone)}`;
  const ateKcal =
    assignment?.compliance?.loggedTotals?.energyKcal ?? event.kcal ?? null;
  const foodCount = assignment?.prescription?.items?.length ?? 0;
  const edit = clientEditMarker(assignment?.compliance, event.traineeDisplayName ?? "Client", zone);
  const changed =
    tag.kind === "changed" ||
    tag.kind === "ate_out" ||
    assignment?.compliance?.outcome === "modified";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <Pressable
        style={styles.scrim}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      />
      <View style={styles.sheet} accessibilityRole="summary">
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{`${first} · ${mealName}`}</Text>
            <Text style={styles.sub}>
              {`${when}${changed ? " · changed from the plan" : ""}`}
            </Text>
          </View>
          <View style={styles.badge}>
            <RefreshCw color={theme.colors.ink2} size={13} strokeWidth={2.2} />
            <Text style={styles.badgeText}>{edit ? "Edited" : tag.label}</Text>
          </View>
        </View>

        {edit ? (
          <View style={styles.editBox} testID="meal-sheet-client-edit">
            <Pencil color={theme.colors.ink2} size={16} strokeWidth={2.2} />
            <View style={{ flex: 1 }}>
              <Text style={styles.editBy}>{edit.by}</Text>
              {edit.was ? <Text style={styles.editWas}>{edit.was}</Text> : null}
            </View>
          </View>
        ) : null}

        <View style={styles.summaryBox}>
          <Text style={styles.summary}>{event.summary}</Text>
          {ateKcal != null ? (
            <Text style={styles.kcal}>{`${ateKcal.toLocaleString("en-IN")} kcal logged`}</Text>
          ) : null}
          {foodCount > 0 ? (
            <Text style={styles.meta}>
              {`${foodCount} food${foodCount === 1 ? "" : "s"} on the plan`}
            </Text>
          ) : null}
          <Text style={styles.meta}>
            {`For ${formatPersonName(event.traineeDisplayName ?? "Client")}`}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={onOpenClient}
            style={styles.openBtn}
          >
            <Text style={styles.openText}>{`Open ${first}`}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onAddNote}
            style={styles.noteBtn}
          >
            <NotebookPen color={theme.colors.brand} size={16} strokeWidth={2.2} />
            <Text style={styles.noteText}>Add note</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createThemedStyles((t) => ({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: t.colors.scrim,
  },
  sheet: {
    backgroundColor: t.colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    bottom: 0,
    left: 0,
    paddingBottom: 28,
    paddingHorizontal: 16,
    paddingTop: 16,
    position: "absolute",
    right: 0,
  },
  head: { flexDirection: "row", gap: 12, marginBottom: 14 },
  title: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 20,
  },
  sub: { color: t.colors.ink3, fontSize: 14, marginTop: 2 },
  badge: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: t.colors.fill,
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    color: t.colors.ink2,
    fontFamily: fontFamilySemiBold,
    fontSize: 12,
  },
  editBox: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 14,
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
    padding: 14,
  },
  editBy: { color: t.colors.ink, fontFamily: fontFamilySemiBold, fontSize: 15 },
  editWas: { color: t.colors.ink3, fontSize: 14, marginTop: 2 },
  summaryBox: {
    backgroundColor: t.colors.fill,
    borderRadius: 14,
    marginBottom: 8,
    padding: 14,
  },
  summary: { color: t.colors.ink, fontSize: 15, lineHeight: 21 },
  kcal: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
    marginTop: 8,
  },
  meta: { color: t.colors.ink3, fontSize: 13, marginTop: 4 },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  openBtn: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 14,
    flex: 1,
    height: 48,
    justifyContent: "center",
  },
  openText: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
  },
  noteBtn: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 14,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    height: 48,
    justifyContent: "center",
  },
  noteText: {
    color: t.colors.brand,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
  },
}));
