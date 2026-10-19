import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, TextInput, View, Pressable } from "react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type {
  Checkin,
  CheckinDraftAnswers,
  CheckinFieldDefinition,
  CheckinFormVersion,
  CoachingRelationship,
} from "@fitbud/contracts";
import { formatCivilDate } from "@fitbud/core";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { createIdempotencyKey } from "../lib/idempotency";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";
import { pickTodayCheckin } from "./pickTodayCheckin";

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

function answersToPayload(
  fields: CheckinFieldDefinition[],
  values: Record<string, string>,
): CheckinDraftAnswers {
  const fieldAnswers: Record<string, string | number | boolean> = {};
  let wellbeing: string | undefined;
  let notes: string | null | undefined;
  let bodyWeightKg: number | null | undefined;

  for (const field of fields) {
    const raw = values[field.id] ?? "";
    if (field.id === "wellbeing" || field.label.toLowerCase().includes("wellbeing") || field.label.toLowerCase().includes("feeling")) {
      wellbeing = raw.trim() || undefined;
    }
    if (field.id === "notes") {
      notes = raw.trim() || null;
    }
    if (
      field.type === "measurement" &&
      field.measurementType === "body_weight_kg"
    ) {
      const n = raw.trim() ? Number(raw) : null;
      bodyWeightKg = n != null && Number.isFinite(n) ? n : null;
    }
    if (!raw.trim() && field.type !== "yes_no") continue;
    if (field.type === "number" || field.type === "measurement" || field.type === "scale_1_5") {
      const n = Number(raw);
      if (Number.isFinite(n)) fieldAnswers[field.id] = n;
    } else if (field.type === "yes_no") {
      if (raw === "yes" || raw === "no") fieldAnswers[field.id] = raw === "yes";
    } else {
      fieldAnswers[field.id] = raw;
    }
  }

  return {
    ...(wellbeing ? { wellbeing } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(bodyWeightKg !== undefined ? { bodyWeightKg } : {}),
    ...(Object.keys(fieldAnswers).length > 0 ? { fieldAnswers } : {}),
  };
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
  const { api } = useAuth();
  const [form, setForm] = useState<CheckinFormVersion | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [recordVersion, setRecordVersion] = useState(checkin.recordVersion);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(
    checkin.recordStatus === "submitted",
  );

  useEffect(() => {
    let cancelled = false;
    void api
      .getCheckinForm(checkin.id)
      .then((loaded) => {
        if (cancelled) return;
        setForm(loaded);
        const initial: Record<string, string> = {};
        for (const field of loaded.fields) {
          const fromAnswers = checkin.answers?.fieldAnswers?.[field.id];
          if (typeof fromAnswers === "string") initial[field.id] = fromAnswers;
          else if (typeof fromAnswers === "number")
            initial[field.id] = String(fromAnswers);
          else if (typeof fromAnswers === "boolean")
            initial[field.id] = fromAnswers ? "yes" : "no";
          if (field.id === "wellbeing" && checkin.answers?.wellbeing) {
            initial[field.id] = checkin.answers.wellbeing;
          }
          if (field.id === "notes" && checkin.answers?.notes) {
            initial[field.id] = checkin.answers.notes;
          }
          if (
            field.type === "measurement" &&
            field.measurementType === "body_weight_kg" &&
            checkin.answers?.bodyWeightKg != null
          ) {
            initial[field.id] = String(checkin.answers.bodyWeightKg);
          }
        }
        setValues(initial);
      })
      .catch(() => {
        if (!cancelled) {
          setForm({
            id: checkin.checkinFormVersionId,
            templateId: checkin.checkinFormVersionId,
            key: "fallback",
            version: 1,
            scope: "global",
            fields: [
              {
                id: "wellbeing",
                label: "How are you feeling?",
                type: "short_text",
                required: true,
                maxLength: 1000,
              },
              {
                id: "notes",
                label: "Optional notes",
                type: "long_text",
                required: false,
              },
              {
                id: "body_weight",
                label: "Body weight (kg)",
                type: "measurement",
                measurementType: "body_weight_kg",
                required: false,
              },
            ],
            createdAt: new Date().toISOString(),
          });
          setValues({
            wellbeing: checkin.answers?.wellbeing ?? "",
            notes: checkin.answers?.notes ?? "",
            body_weight:
              checkin.answers?.bodyWeightKg != null
                ? String(checkin.answers.bodyWeightKg)
                : "",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, checkin]);

  const fields = useMemo(() => form?.fields ?? [], [form]);

  async function saveDraft() {
    if (!form) return;
    setActing(true);
    setError(null);
    try {
      const answers = answersToPayload(fields, values);
      const { results } = await enqueueAndPush(sync, {
        recordId: checkin.id,
        operation: "checkin.save_draft",
        expectedServerVersion: recordVersion,
        payload: {
          checkinId: checkin.id,
          body: {
            expectedVersion: recordVersion,
            answers,
          },
        },
      });
      const result =
        results.find((item) => item.recordId === checkin.id) ?? results[0];
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
    if (!form) return;
    setActing(true);
    setError(null);
    try {
      const answers = answersToPayload(fields, values);
      if (!answers.wellbeing && !answers.fieldAnswers) {
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
              wellbeing:
                answers.wellbeing ??
                values[fields.find((f) => f.required)?.id ?? ""] ??
                "OK",
              notes: answers.notes ?? null,
              bodyWeightKg: answers.bodyWeightKg ?? null,
              fieldAnswers: answers.fieldAnswers,
            },
          },
        },
      });
      const result =
        results.find((item) => item.recordId === checkin.id) ?? results[0];
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
        chrome="app"
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
      chrome="app"
      title="Check-in"
      subtitle={`${statusLabel(checkin.status)} · due ${formatCivilDate(checkin.localDate)}`}
    >
      {error ? <ErrorBanner message={error} /> : null}
      {!form ? (
        <Text style={styles.bannerBody}>Loading form…</Text>
      ) : (
        fields.map((field) => {
          const label = `${field.label}${field.required ? " *" : ""}`;
          if (field.type === "scale_1_5") {
            return (
              <View key={field.id} style={styles.field}>
                <Text style={styles.label}>{label}</Text>
                <View style={styles.scaleRow}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Pressable
                      key={n}
                      onPress={() =>
                        setValues((current) => ({
                          ...current,
                          [field.id]: String(n),
                        }))
                      }
                      style={[
                        styles.scaleChip,
                        values[field.id] === String(n)
                          ? styles.scaleChipOn
                          : null,
                      ]}
                    >
                      <Text>{n}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.help}>
                  1 · {field.lowLabel ?? "Very low"} … 5 ·{" "}
                  {field.highLabel ?? "Very high"}
                </Text>
              </View>
            );
          }
          if (field.type === "yes_no") {
            return (
              <View key={field.id} style={styles.field}>
                <Text style={styles.label}>{label}</Text>
                <View style={styles.scaleRow}>
                  {(["yes", "no"] as const).map((option) => (
                    <Pressable
                      key={option}
                      onPress={() =>
                        setValues((current) => ({
                          ...current,
                          [field.id]: option,
                        }))
                      }
                      style={[
                        styles.scaleChip,
                        values[field.id] === option ? styles.scaleChipOn : null,
                      ]}
                    >
                      <Text>{option === "yes" ? "Yes" : "No"}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          }
          if (field.type === "photo_intent") {
            return (
              <View key={field.id} style={styles.field}>
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.help}>
                  Photo slot
                  {field.photoSlot ? ` · ${field.photoSlot}` : ""}
                </Text>
              </View>
            );
          }
          const multiline =
            field.type === "long_text" || field.type === "short_text";
          return (
            <View key={field.id} style={styles.field}>
              <Text style={styles.label}>{label}</Text>
              <TextInput
                accessibilityLabel={field.label}
                value={values[field.id] ?? ""}
                onChangeText={(text) =>
                  setValues((current) => ({ ...current, [field.id]: text }))
                }
                multiline={field.type === "long_text" || field.type === "short_text"}
                keyboardType={
                  field.type === "number" || field.type === "measurement"
                    ? "decimal-pad"
                    : "default"
                }
                style={
                  field.type === "long_text" ||
                  (multiline && field.type === "short_text" && field.id === "wellbeing")
                    ? styles.input
                    : styles.inputSingle
                }
                placeholder={field.helpText ?? ""}
                placeholderTextColor={colors.midGrey}
              />
            </View>
          );
        })
      )}
      <PrimaryButton
        label={acting ? "Working…" : "Submit check-in"}
        onPress={() => {
          void submit();
        }}
        disabled={acting || !canSubmitCheckin(checkin.status) || !form}
      />
      <PrimaryButton
        label="Save draft"
        variant="secondary"
        onPress={() => {
          void saveDraft();
        }}
        disabled={acting || !form}
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
      setCheckin(pickTodayCheckin(listed.items));
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

  if (loading) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Check-in</Text>
        <Text style={styles.help}>Loading…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Check-in</Text>
        <Text style={styles.help}>{error}</Text>
      </View>
    );
  }
  if (!checkin) return null;

  return (
    <Pressable style={styles.card} onPress={() => onOpen(checkin)}>
      <Text style={styles.cardTitle}>Check-in</Text>
      <Text style={styles.help}>
        {statusLabel(checkin.status)} · {formatCivilDate(checkin.localDate)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.md },
  label: {
    fontWeight: "600",
    marginBottom: spacing.xs,
    color: colors.nearBlack,
  },
  help: { color: colors.midGrey, marginTop: spacing.xs },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.sm,
    color: colors.nearBlack,
    textAlignVertical: "top",
  },
  inputSingle: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    color: colors.nearBlack,
  },
  banner: {
    backgroundColor: colors.paleLavender,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  bannerTitle: { fontWeight: "700", marginBottom: spacing.xs },
  bannerBody: { color: colors.darkGrey },
  scaleRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  scaleChip: {
    minWidth: 40,
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scaleChipOn: {
    backgroundColor: colors.paleLavender,
    borderColor: colors.indigo,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitle: { fontWeight: "700", marginBottom: spacing.xs },
});
