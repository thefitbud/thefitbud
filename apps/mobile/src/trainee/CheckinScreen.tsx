import { useCallback, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type { Checkin, CoachingRelationship } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { createIdempotencyKey } from "../lib/idempotency";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";

function statusLabel(status: Checkin["status"]): string {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "due":
      return "Due";
    case "submitted":
      return "Submitted";
    case "reviewed":
      return "Reviewed";
    case "overdue":
      return "Overdue";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function canSubmitCheckin(status: Checkin["status"]): boolean {
  return status === "due" || status === "overdue";
}

export function CheckinScreen({
  checkin,
  onDone,
}: {
  relationship: CoachingRelationship;
  checkin: Checkin;
  onDone: () => void;
}) {
  const sync = useSyncEngine();
  const [wellbeing, setWellbeing] = useState(
    checkin.answers?.wellbeing ?? "",
  );
  const [notes, setNotes] = useState(checkin.answers?.notes ?? "");
  const [bodyWeight, setBodyWeight] = useState(
    checkin.answers?.bodyWeightKg != null
      ? String(checkin.answers.bodyWeightKg)
      : "",
  );
  const [recordVersion, setRecordVersion] = useState(checkin.recordVersion);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(
    checkin.recordStatus === "submitted",
  );

  async function saveDraft() {
    setActing(true);
    setError(null);
    try {
      const weight =
        bodyWeight.trim().length > 0 ? Number(bodyWeight) : null;
      if (bodyWeight.trim().length > 0 && !Number.isFinite(weight)) {
        setError("Body weight must be a number.");
        return;
      }
      const { results } = await enqueueAndPush(sync, {
        recordId: checkin.id,
        operation: "checkin.save_draft",
        expectedServerVersion: recordVersion,
        payload: {
          checkinId: checkin.id,
          body: {
            expectedVersion: recordVersion,
            answers: {
              wellbeing: wellbeing.trim() || undefined,
              notes: notes.trim() || null,
              bodyWeightKg: weight,
            },
          },
        },
      });
      const result = results.find((item) => item.recordId === checkin.id) ?? results[0];
      if (result?.status === "conflicted") {
        setError(result.error?.message ?? "Check-in draft conflict.");
        return;
      }
      if (result?.serverVersion != null) {
        setRecordVersion(result.serverVersion);
      }
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not save check-in draft.",
      );
    } finally {
      setActing(false);
    }
  }

  async function submit() {
    setActing(true);
    setError(null);
    try {
      const weight =
        bodyWeight.trim().length > 0 ? Number(bodyWeight) : null;
      if (bodyWeight.trim().length > 0 && !Number.isFinite(weight)) {
        setError("Body weight must be a number.");
        return;
      }
      if (wellbeing.trim().length === 0) {
        setError("Share how you are feeling before submitting.");
        return;
      }
      const { results } = await enqueueAndPush(sync, {
        recordId: checkin.id,
        operation: "checkin.submit",
        expectedServerVersion: recordVersion,
        payload: {
          checkinId: checkin.id,
          body: {
            expectedVersion: recordVersion,
            answers: {
              wellbeing: wellbeing.trim(),
              notes: notes.trim() || null,
              bodyWeightKg: weight,
            },
          },
        },
      });
      const result = results.find((item) => item.recordId === checkin.id) ?? results[0];
      if (result?.status === "rejected" || result?.status === "conflicted") {
        setError(result.error?.message ?? "Could not submit check-in.");
        return;
      }
      if (result?.serverVersion != null) {
        setRecordVersion(result.serverVersion);
      }
      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not submit check-in.",
      );
    } finally {
      setActing(false);
    }
  }

  if (submitted) {
    return (
      <Screen
        title="Check-in submitted"
        subtitle="Your trainer can review this when ready."
      >
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Received</Text>
          <Text style={styles.bannerBody}>
            Thanks — nothing else is required for this check-in.
          </Text>
        </View>
        <PrimaryButton label="Back to Today" onPress={onDone} />
      </Screen>
    );
  }

  return (
    <Screen
      title="Check-in"
      subtitle={`${statusLabel(checkin.status)} · due ${checkin.localDate}`}
    >
      {error ? <ErrorBanner message={error} /> : null}
      <View style={styles.field}>
        <Text style={styles.label}>How are you feeling?</Text>
        <TextInput
          accessibilityLabel="Wellbeing"
          value={wellbeing}
          onChangeText={setWellbeing}
          multiline
          style={styles.input}
          placeholder="Energy, recovery, stress…"
          placeholderTextColor={colors.midGrey}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Optional notes</Text>
        <TextInput
          accessibilityLabel="Notes"
          value={notes}
          onChangeText={setNotes}
          multiline
          style={styles.input}
          placeholder="Anything useful for your trainer"
          placeholderTextColor={colors.midGrey}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Body weight (kg, optional)</Text>
        <TextInput
          accessibilityLabel="Body weight"
          value={bodyWeight}
          onChangeText={setBodyWeight}
          keyboardType="decimal-pad"
          style={styles.inputSingle}
          placeholder="e.g. 72.5"
          placeholderTextColor={colors.midGrey}
        />
      </View>
      <PrimaryButton
        label={acting ? "Working…" : "Submit check-in"}
        onPress={() => {
          void submit();
        }}
        disabled={acting || !canSubmitCheckin(checkin.status)}
      />
      <PrimaryButton
        label="Save draft"
        variant="secondary"
        onPress={() => {
          void saveDraft();
        }}
        disabled={acting}
      />
      <PrimaryButton label="Cancel" variant="ghost" onPress={onDone} />
    </Screen>
  );
}

export function TodayCheckinCard({
  relationship,
  onOpen,
}: {
  relationship: CoachingRelationship;
  onOpen: (checkin: Checkin) => void;
}) {
  const { api } = useAuth();
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await api.ensureDueCheckin(relationship.id, createIdempotencyKey());
      const listed = await api.listCheckins(relationship.id);
      const actionable = listed.items.find(
        (item) =>
          item.status === "due" ||
          item.status === "overdue" ||
          item.status === "scheduled",
      );
      setCheckin(actionable ?? null);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load check-in.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, relationship.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const subtitle = useMemo(() => {
    if (!checkin) return null;
    return `${statusLabel(checkin.status)} · ${checkin.localDate}`;
  }, [checkin]);

  if (loading) {
    return (
      <View style={styles.banner}>
        <Text style={styles.bannerBody}>Checking for a due check-in…</Text>
      </View>
    );
  }

  if (error) {
    return <ErrorBanner message={error} />;
  }

  if (!checkin || checkin.status === "scheduled") {
    return (
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Check-in</Text>
        <Text style={styles.bannerBody}>
          {checkin
            ? `Next check-in is scheduled for ${checkin.localDate}.`
            : "No check-in is due right now."}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.banner}>
      <Text style={styles.bannerTitle}>Check-in {statusLabel(checkin.status)}</Text>
      <Text style={styles.bannerBody}>{subtitle}</Text>
      <PrimaryButton
        label="Open check-in"
        onPress={() => onOpen(checkin)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.paleLavender,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  bannerTitle: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "600",
  },
  bannerBody: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  field: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  label: {
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.lightGrey,
    borderRadius: 12,
    padding: spacing.md,
    color: colors.nearBlack,
    backgroundColor: colors.white,
    textAlignVertical: "top",
  },
  inputSingle: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.lightGrey,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    color: colors.nearBlack,
    backgroundColor: colors.white,
  },
});
