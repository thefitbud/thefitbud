import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type { CheckinReviewContext, CheckinReviewOutcome } from "@fitbud/contracts";
import { formatCivilDate, formatClockTime, formatPersonName, labelFor } from "@fitbud/core";
import { colors, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { Snackbar } from "../components/Snackbar";
import { StatusChip } from "../components/StatusChip";
import { createIdempotencyKey } from "../lib/idempotency";

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

function answerText(answers: Record<string, unknown> | null, key: string): string {
  const value = answers?.[key];
  return typeof value === "string" ? value : "";
}

function answerNumber(answers: Record<string, unknown> | null, key: string): number | null {
  const value = answers?.[key];
  return typeof value === "number" ? value : null;
}

export function CheckinReviewScreen({
  checkinId,
  relationshipId,
  onBack,
}: Props) {
  const { api, me } = useAuth();
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
        } catch {
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
  const answers = (context?.checkin.answers ?? null) as Record<string, unknown> | null;
  const first = name.split(" ")[0] || "them";
  const scales = [
    ["Energy", answerNumber(answers, "energy")],
    ["Hunger", answerNumber(answers, "hunger")],
    ["Stress", answerNumber(answers, "stress")],
  ] as const;
  const questions = [
    ["What went well?", answerText(answers, "went_well") || answerText(answers, "wellbeing")],
    ["What was hard?", answerText(answers, "was_hard") || answerText(answers, "notes")],
    [
      `Anything for ${formatPersonName(me?.email?.split("@")[0]?.split(".")[0] ?? "your coach").split(" ")[0]}?`,
      answerText(answers, "for_coach"),
    ],
  ];

  const weight = context?.measurements.filter((item) => item.type === "body_weight_kg") ?? [];
  const waist = context?.measurements.filter((item) => item.type === "waist_cm") ?? [];

  async function save() {
    if (!context || reviewed || offline) return;
    setActing(true);
    setError(null);
    try {
      await api.recordCheckinReview(
        checkinId,
        { outcome, notes: note.trim() ? note.trim() : null },
        createIdempotencyKey(),
      );
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
      setToast("Review saved");
      onBack();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        setError(`${first}'s check-in changed. Pull to reload.`);
      } else {
        setError(err instanceof ApiClientError ? err.message : "Couldn't load. Pull to try again.");
      }
    } finally {
      setActing(false);
    }
  }

  const submitted = context?.checkin.submittedAt;
  const subtitle = context
    ? `Weekly check-in · ${formatCivilDate(context.checkin.localDate)}${
        submitted ? `, ${formatClockTime(submitted, "Asia/Kolkata")}` : ""
      }`
    : "";

  const sheet = reviewed || !context ? null : (
    <View style={styles.sheet}>
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
              <Text style={[styles.outcomeText, selected ? styles.outcomeTextOn : null]}>
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
        <View style={[styles.switch, visible ? styles.switchOn : null]} />
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
      subtitle={subtitle}
      chrome="app"
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load().finally(() => setRefreshing(false));
      }}
      footer={sheet}
    >
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
        <Text style={styles.backText}>‹</Text>
      </Pressable>
      {offline ? (
        <Text style={styles.offline}>You're offline. Showing the last update from this phone.</Text>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      {loading && !context ? <View style={styles.skeleton} accessibilityLabel="Loading" /> : null}
      {reviewed ? (
        <View style={styles.block}>
          <StatusChip kind="checkin" value="reviewed" />
          {context?.checkin.review?.notes ? (
            <Text style={styles.body}>{context.checkin.review.notes}</Text>
          ) : null}
        </View>
      ) : null}
      {scales.some((item) => item[1] != null) ? (
        <View style={styles.scales}>
          {scales.map(([label, value]) =>
            value == null ? null : (
              <View key={label} style={styles.scale}>
                <Text style={styles.scaleLabel}>{label}</Text>
                <Text style={styles.scaleValue}>{value} of 5</Text>
                <View style={styles.pips}>
                  {Array.from({ length: 5 }, (_, index) => (
                    <View
                      key={index}
                      style={[styles.pip, index < value ? styles.pipOn : null]}
                    />
                  ))}
                </View>
              </View>
            ),
          )}
        </View>
      ) : null}
      {questions.map(([label, value]) =>
        value ? (
          <View key={label} style={styles.block}>
            <Text style={styles.q}>{label}</Text>
            <Text style={styles.body}>{value}</Text>
          </View>
        ) : null,
      )}
      <View style={styles.measureRow}>
        <Measure
          label="Weight"
          current={weight[0]}
          previous={weight[1]}
        />
        <Measure label="Waist" current={waist[0]} previous={waist[1]} />
      </View>
      {(context?.photos.length ?? 0) > 0 ? (
        <Text style={styles.body}>{context?.photos.length} photos</Text>
      ) : null}
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
      {toast ? <Snackbar message={toast} onDismiss={() => setToast(null)} /> : null}
    </Screen>
  );
}

function Measure({
  label,
  current,
  previous,
}: {
  label: string;
  current?: { value: string; unit?: string; observedAt: string };
  previous?: { value: string; unit?: string; observedAt: string };
}) {
  if (!current) return <View style={styles.measure} />;
  const delta =
    previous && Number.isFinite(Number(current.value)) && Number.isFinite(Number(previous.value))
      ? Number(current.value) - Number(previous.value)
      : null;
  return (
    <View style={styles.measure}>
      <Text style={styles.scaleLabel}>{label}</Text>
      <Text style={styles.scaleValue}>
        {current.value} {current.unit ?? ""}
      </Text>
      {delta != null ? (
        <Text style={styles.delta}>
          {delta > 0 ? "+" : ""}
          {Number(delta.toFixed(1))} since {formatCivilDate(previous!.observedAt.slice(0, 10))}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { minHeight: 44, justifyContent: "center", width: 44 },
  backText: { color: colors.indigo, fontSize: 28 },
  scales: { flexDirection: "row", gap: 8, marginTop: 8 },
  scale: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    padding: 10,
  },
  scaleLabel: { color: colors.midGrey, fontSize: 13 },
  scaleValue: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
    marginTop: 4,
  },
  pips: { flexDirection: "row", gap: 4, marginTop: 8 },
  pip: { backgroundColor: "#E7E9F2", borderRadius: 999, flex: 1, height: 4 },
  pipOn: { backgroundColor: colors.deepNavy },
  block: { marginTop: 16 },
  q: { color: colors.deepNavy, fontFamily: fontFamilySemiBold, fontSize: 16 },
  body: { color: colors.nearBlack, fontSize: 16, lineHeight: 22, marginTop: 4 },
  measureRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  measure: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    padding: 12,
  },
  delta: { color: colors.midGrey, fontSize: 13, marginTop: 4 },
  since: { color: colors.deepNavy, fontSize: 15, lineHeight: 22, marginTop: 16 },
  sheet: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  outcomes: { flexDirection: "row", gap: 6 },
  outcome: {
    borderRadius: 999,
    flex: 1,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  outcomeOn: { backgroundColor: colors.white, borderColor: "#E7E9F2", borderWidth: 1 },
  outcomeText: { color: colors.midGrey, fontSize: 12, textAlign: "center" },
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
  switch: {
    backgroundColor: "#E7E9F2",
    borderRadius: 999,
    height: 28,
    width: 48,
  },
  switchOn: { backgroundColor: colors.indigo },
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
