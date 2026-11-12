import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, TextInput, View } from "react-native";
import { Eye } from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type { CheckinReviewContext, CheckinReviewOutcome } from "@fitbud/contracts";
import {
  deviceTimeZone,
  formatCivilDate,
  formatClockTime,
  formatPersonName,
  labelFor,
} from "@fitbud/core";
import { colors, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { Snackbar } from "../components/Snackbar";
import { StatusChip } from "../components/StatusChip";
import { createIdempotencyKey } from "../lib/idempotency";
import { reportError } from "../lib/reportError";
import { Photos } from "./checkinReview/Photos";
import { checkinReviewRows, type ReviewMeasureTile } from "./checkinReviewRows";
import {
  noteForCheckin,
  reviewedSummaryLine,
  signedDelta,
} from "./checkinReview/savedReview";

const OUTCOMES: Array<{ value: CheckinReviewOutcome; label: string }> = [
  { value: "acknowledged", label: labelFor("checkin_review_outcome", "acknowledged") },
  { value: "needs_follow_up", label: labelFor("checkin_review_outcome", "needs_follow_up") },
  { value: "adjust_coaching", label: labelFor("checkin_review_outcome", "adjust_coaching") },
];

type Props = {
  checkinId: string;
  relationshipId: string;
  onBack: () => void;
  onOpenClient: (relationshipId: string) => void;
};

export function CheckinReviewScreen({
  checkinId,
  relationshipId,
  onBack,
}: Props) {
  const { api } = useAuth();
  // D-W3b-11 (b): trainer screens display in the device zone (resolver), never the stored profile zone.
  const zone = deviceTimeZone();
  const [context, setContext] = useState<CheckinReviewContext | null>(null);
  const [name, setName] = useState("Client");
  const [outcome, setOutcome] = useState<CheckinReviewOutcome>("needs_follow_up");
  const [note, setNote] = useState("");
  const [visible, setVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await api.getCheckinReviewContext(checkinId);
      setContext(result);
      const rid = relationshipId || result.checkin.coachingRelationshipId;
      if (rid) {
        try {
          const workspace = await api.getClientWorkspace(rid);
          setName(formatPersonName(workspace.header.traineeDisplayName));
        } catch (workspaceError) {
          reportError("checkinReview.workspace", workspaceError);
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

  const reviewed = Boolean(context?.checkin.review) || context?.checkin.status === "reviewed";
  const first = name.split(" ")[0] || "them";
  const savedNote = context ? noteForCheckin(context.previousNotes, checkinId) : null;
  const savedReview = context?.checkin.review ?? null;
  const rows = context
    ? checkinReviewRows({
        fields: context.pinnedForm.fields,
        answers: context.checkin.answers,
        measurements: context.measurements,
      })
    : { ratings: [], measures: [], texts: [] };

  async function save() {
    if (!context || reviewed || offline) return;
    setActing(true);
    setError(null);
    let recorded = false;
    try {
      await api.recordCheckinReview(
        checkinId,
        { outcome, notes: note.trim() ? note.trim() : null },
        createIdempotencyKey(),
      );
      recorded = true;
      const rid = relationshipId || context.checkin.coachingRelationshipId;
      if (note.trim() && rid) {
        await api.createTrainerNote(
          rid,
          {
            body: note.trim(),
            visibility: visible ? "client" : "private",
            checkinId,
          },
          createIdempotencyKey(),
        );
      }
      // Stay on the screen: reload so it shows the saved, read-only review.
      setToast(note.trim() && visible ? `Review saved · shared with ${first}` : "Review saved");
      await load();
    } catch (err) {
      // The review itself is stored once recorded; show it read-only.
      if (recorded) {
        // The review is stored; only the note failed. Say what is known.
        void load();
        if (!(err instanceof ApiClientError)) reportError("checkinReview.save", err);
        setError("Review saved. The note wasn't shared.");
      } else if (err instanceof ApiClientError && err.status === 409) {
        setError(`${first}'s check-in changed. Pull to reload.`);
      } else if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        reportError("checkinReview.save", err);
        setError("Couldn't save the review. Try again.");
      }
    } finally {
      setActing(false);
    }
  }

  const submitted = context?.checkin.submittedAt;
  const subtitle = context
    ? `Weekly check-in · ${formatCivilDate(context.checkin.localDate)}${
        submitted
          ? `, ${formatClockTime(submitted, zone)}`
          : ""
      }`
    : "";

  const savedSheet =
    reviewed && context ? (
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.savedHead}>
          <StatusChip kind="checkin" value="reviewed" />
          {savedReview ? (
            <Text style={styles.savedLine}>
              {reviewedSummaryLine(savedReview, zone)}
            </Text>
          ) : null}
        </View>
        {savedReview?.notes ? (
          <Text style={styles.savedNote}>{savedReview.notes}</Text>
        ) : null}
        <View style={styles.savedFoot}>
          {savedNote ? (
            <View style={styles.sharedChip}>
              {savedNote.visibility === "client" ? (
                <Eye color={colors.indigo} size={16} />
              ) : null}
              <Text style={styles.sharedChipText}>
                {savedNote.visibility === "client"
                  ? `Visible to ${first}`
                  : "Only you see this note"}
              </Text>
            </View>
          ) : null}
          <Text style={styles.closedLine}>Check-in item closed in Attention</Text>
        </View>
      </View>
    ) : null;

  const sheet = reviewed || !context ? savedSheet : (
    <View style={styles.sheet}>
      <View style={styles.handle} />
      <View style={styles.outcomes}>
        {OUTCOMES.map((item) => {
          const selected = outcome === item.value;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setOutcome(item.value)}
              style={[styles.outcome, selected ? styles.outcomeOn : null]}
            >
              <Text
                numberOfLines={1}
                style={[styles.outcomeText, selected ? styles.outcomeTextOn : null]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        accessibilityLabel={`Add a note for ${first}`}
        placeholder={`Add a note for ${first}`}
        placeholderTextColor={colors.midGrey}
        value={note}
        onChangeText={setNote}
        multiline
        style={styles.note}
      />
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: visible }}
        onPress={() => setVisible((value) => !value)}
        style={styles.visibleRow}
      >
        <View>
          <Text style={styles.visibleLabel}>Visible to {first}</Text>
          <Text style={styles.visibleHint}>
            {visible
              ? `He'll see this note on his Today screen`
              : "Only you see this note"}
          </Text>
        </View>
        {/* Display only: the row Pressable is the single handler. */}
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
          <Switch
            value={visible}
            trackColor={{ false: "#E7E9F2", true: colors.indigo }}
            thumbColor={colors.white}
          />
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={acting || offline}
        onPress={() => void save()}
        style={[styles.save, offline ? styles.disabled : null]}
      >
        <Text style={styles.saveText}>Save review</Text>
      </Pressable>
    </View>
  );

  return (
    <Screen
      title={name}
      chrome="app"
      showHeader={false}
      footerVariant="toast"
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load().finally(() => setRefreshing(false));
      }}
      footer={sheet}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.back}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
            {name}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.back} />
      </View>
      {toast ? <Snackbar leadingCheck message={toast} onDismiss={() => setToast(null)} /> : null}
      {offline ? (
        <Text style={styles.offline}>You're offline. Showing the last update from this phone.</Text>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      {loading && !context ? <View style={styles.skeleton} accessibilityLabel="Loading" /> : null}
      {rows.ratings.length > 0 || rows.texts.length > 0 ? (
        <View style={styles.card}>
          {rows.ratings.length > 0 ? (
            <View style={styles.scales}>
              {rows.ratings.map(({ fieldId, label, value }, index) => (
                <View
                  key={fieldId}
                  style={[styles.scale, index > 0 ? styles.scaleDivider : null]}
                >
                  <Text style={styles.scaleLabel}>{label}</Text>
                  <Text style={styles.scaleValue}>{value} of 5</Text>
                  <View style={styles.pips}>
                    {Array.from({ length: 5 }, (_, pip) => (
                      <View
                        key={pip}
                        style={[styles.pip, pip < value ? styles.pipOn : null]}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          {rows.texts.map(({ fieldId, label, text }, index) => (
            <View
              key={fieldId}
              style={[
                styles.block,
                index > 0 || rows.ratings.length > 0 ? styles.blockDivider : null,
              ]}
            >
              <Text style={styles.q}>{label}</Text>
              <Text style={styles.body}>{text}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {rows.measures.length > 0 ? (
        <View style={styles.measureRow}>
          {rows.measures.map((item) => (
            <Measure key={item.fieldId} item={item} />
          ))}
        </View>
      ) : null}
      {context ? <Photos photos={context.photos} checkinId={checkinId} /> : null}
      {context ? (
        <Text style={styles.since}>
          {context.recentWorkoutAdherence.completed} of{" "}
          {context.recentWorkoutAdherence.completed +
            context.recentWorkoutAdherence.missed +
            context.recentWorkoutAdherence.pending}{" "}
          Workouts ·{" "}
          {context.recentMealCompliance.confirmed +
            context.recentMealCompliance.modified}{" "}
          of{" "}
          {context.recentMealCompliance.confirmed +
            context.recentMealCompliance.modified +
            context.recentMealCompliance.pending +
            context.recentMealCompliance.overdue +
            context.recentMealCompliance.skipped}{" "}
          Meals logged
        </Text>
      ) : null}
    </Screen>
  );
}

function Measure({ item }: { item: ReviewMeasureTile }) {
  return (
    <View style={styles.measure}>
      <Text style={styles.scaleLabel}>{item.label}</Text>
      <Text style={styles.scaleValue}>
        {item.value} {item.unit}
      </Text>
      {item.since ? (
        <Text style={styles.delta}>
          {signedDelta(item.since.delta)} since{" "}
          {formatCivilDate(item.since.previousObservedAt.slice(0, 10))}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", flexDirection: "row", marginBottom: 8 },
  headerText: { alignItems: "center", flex: 1 },
  title: { color: colors.deepNavy, fontFamily: fontFamilySemiBold, fontSize: 20 },
  subtitle: { color: colors.midGrey, fontSize: 14, marginTop: 2 },
  back: { minHeight: 44, justifyContent: "center", width: 44 },
  handle: {
    alignSelf: "center",
    backgroundColor: "#D9DBE8",
    borderRadius: 999,
    height: 4,
    marginBottom: 12,
    width: 40,
  },
  backText: { color: colors.indigo, fontSize: 28 },
  card: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 8,
    overflow: "hidden",
  },
  scales: { flexDirection: "row" },
  scale: { flex: 1, padding: 12 },
  scaleDivider: { borderLeftColor: "#E7E9F2", borderLeftWidth: 1 },
  scaleLabel: { color: colors.midGrey, fontSize: 13 },
  scaleValue: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
    fontVariant: ["tabular-nums"],
    marginTop: 4,
  },
  pips: { flexDirection: "row", gap: 4, marginTop: 8 },
  pip: { backgroundColor: "#E7E9F2", borderRadius: 999, flex: 1, height: 4 },
  pipOn: { backgroundColor: colors.deepNavy },
  block: { padding: 14 },
  blockDivider: { borderTopColor: "#E7E9F2", borderTopWidth: 1 },
  q: { color: colors.midGrey, fontSize: 14 },
  body: { color: colors.nearBlack, fontSize: 16, lineHeight: 22, marginTop: 4 },
  measureRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  measure: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: "48%",
    flexGrow: 0,
    padding: 12,
  },
  delta: { color: colors.midGrey, fontSize: 13, marginTop: 4 },
  savedHead: { alignItems: "center", flexDirection: "row", gap: 10 },
  savedLine: { color: colors.midGrey, flexShrink: 1, fontSize: 14 },
  savedNote: {
    borderColor: "#E7E9F2",
    borderRadius: 16,
    borderWidth: 1,
    color: colors.deepNavy,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 10,
    padding: 12,
  },
  savedFoot: { alignItems: "center", flexDirection: "row", gap: 10, marginTop: 10 },
  sharedChip: {
    alignItems: "center",
    backgroundColor: "#EAF0FF",
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
  },
  sharedChipText: { color: colors.indigo, fontSize: 14 },
  closedLine: { color: colors.midGrey, flex: 1, fontSize: 14 },
  since: { color: colors.deepNavy, fontSize: 15, lineHeight: 22, marginTop: 16 },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginHorizontal: -16,
    padding: 16,
    paddingBottom: 24,
    shadowColor: "#1B1650",
    shadowOffset: { height: -2, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  outcomes: {
    backgroundColor: "#ECEAF6",
    borderRadius: 14,
    flexDirection: "row",
    padding: 3,
  },
  outcome: {
    alignItems: "center",
    borderRadius: 12,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 4,
  },
  outcomeOn: { backgroundColor: colors.white },
  outcomeText: { color: colors.midGrey, fontSize: 13, textAlign: "center" },
  outcomeTextOn: { color: colors.deepNavy, fontFamily: fontFamilySemiBold },
  note: {
    borderColor: "#E7E9F2",
    borderRadius: 16,
    borderWidth: 1,
    color: colors.deepNavy,
    fontSize: 16,
    marginTop: 10,
    minHeight: 72,
    padding: 12,
  },
  visibleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    minHeight: 44,
  },
  visibleLabel: { color: colors.deepNavy, fontFamily: fontFamilySemiBold, fontSize: 15 },
  visibleHint: { color: colors.midGrey, fontSize: 13 },
  save: {
    alignItems: "center",
    backgroundColor: colors.indigo,
    borderRadius: 16,
    height: 56,
    justifyContent: "center",
    marginTop: 8,
  },
  saveText: { color: colors.white, fontFamily: fontFamilySemiBold, fontSize: 17 },
  disabled: { opacity: 0.45 },
  skeleton: { backgroundColor: "#E7E9F2", borderRadius: 20, height: 180 },
  offline: { color: colors.deepNavy, fontSize: 14, marginBottom: 8 },
});
