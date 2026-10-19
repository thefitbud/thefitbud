import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type {
  Checkin,
  CheckinDraftAnswers,
  CheckinFieldDefinition,
  CheckinFormVersion,
  CheckinReviewOutcome,
  CoachingRelationship,
} from "@fitbud/contracts";
import { formatCivilDate } from "@fitbud/core";
import { colors, radii, spacing, touchTargetMin } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { createIdempotencyKey } from "../lib/idempotency";
import { addDays, localDateInTimezone } from "../lib/dates";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";
import { messageFromSyncResults } from "./dataCache";
import { pickTodayCheckin } from "./pickTodayCheckin";

type Step = "form" | "review" | "done";

function coachFirstName(relationship: CoachingRelationship): string {
  const raw = relationship.trainerDisplayName?.trim();
  if (!raw) return "Your coach";
  return raw.split(/\s+/)[0] ?? raw;
}

function outcomeCopy(
  outcome: CheckinReviewOutcome,
  coach: string,
): string {
  switch (outcome) {
    case "acknowledged":
      return "Reviewed";
    case "needs_follow_up":
      return `${coach} will follow up`;
    case "adjust_coaching":
      return `${coach} is updating your plan`;
    default: {
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}

function sectionForField(field: CheckinFieldDefinition): string {
  if (field.type === "measurement") return "Measurements";
  if (field.type === "photo_intent") return "Photos";
  if (field.type === "scale_1_5") return "How was your week";
  return "Reflection";
}

function groupFields(
  fields: CheckinFieldDefinition[],
): Array<{ title: string; fields: CheckinFieldDefinition[] }> {
  const order: string[] = [];
  const map = new Map<string, CheckinFieldDefinition[]>();
  for (const field of fields) {
    const title = sectionForField(field);
    if (!map.has(title)) {
      map.set(title, []);
      order.push(title);
    }
    map.get(title)!.push(field);
  }
  return order.map((title) => ({ title, fields: map.get(title)! }));
}

function canEditCheckin(status: Checkin["status"]): boolean {
  return status === "due" || status === "overdue" || status === "scheduled";
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
    if (
      field.id === "wellbeing" ||
      field.label.toLowerCase().includes("wellbeing") ||
      field.label.toLowerCase().includes("feeling")
    ) {
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
    if (
      field.type === "number" ||
      field.type === "measurement" ||
      field.type === "scale_1_5"
    ) {
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

function FieldControl({
  field,
  value,
  onChange,
  onBlur,
}: {
  field: CheckinFieldDefinition;
  value: string;
  onChange: (next: string) => void;
  onBlur: () => void;
}) {
  const label = `${field.label}${field.required ? " *" : ""}`;

  if (field.type === "scale_1_5") {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.scaleRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable
              key={n}
              accessibilityRole="button"
              accessibilityLabel={`${field.label} ${n}`}
              onPress={() => {
                onChange(String(n));
                onBlur();
              }}
              style={[
                styles.scaleChip,
                value === String(n) ? styles.scaleChipOn : null,
              ]}
            >
              <Text>{n}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.help}>
          1 · {field.lowLabel ?? "Very low"} … 5 · {field.highLabel ?? "Very high"}
        </Text>
      </View>
    );
  }

  if (field.type === "yes_no") {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.scaleRow}>
          {(["yes", "no"] as const).map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityLabel={`${field.label} ${option}`}
              onPress={() => {
                onChange(option);
                onBlur();
              }}
              style={[
                styles.scaleChip,
                value === option ? styles.scaleChipOn : null,
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
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.help}>
          {field.photoSlot === "front"
            ? "Front photo · optional unless required"
            : field.photoSlot === "side"
              ? "Side photo · optional unless required"
              : field.photoSlot === "back"
                ? "Back photo · optional unless required"
                : "Photo slot · optional unless required"}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mark ${field.label} ready`}
          style={[
            styles.photoSlot,
            value === "noted" ? styles.scaleChipOn : null,
          ]}
          onPress={() => {
            onChange(value === "noted" ? "" : "noted");
            onBlur();
          }}
        >
          <Text style={styles.photoSlotText}>
            {value === "noted" ? "Noted for upload" : "Add later"}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (field.type === "measurement") {
    const unit =
      field.measurementType === "body_weight_kg"
        ? "kg"
        : field.unit ?? "cm";
    const step = field.measurementType === "body_weight_kg" ? 0.1 : 0.5;
    const numeric = Number(value);
    const current = Number.isFinite(numeric) && numeric > 0 ? numeric : 70;
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.stepperRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Decrease"
            style={styles.stepperBtn}
            onPress={() => {
              const next = Math.round((current - step) * 10) / 10;
              onChange(String(next));
              onBlur();
            }}
          >
            <Text style={styles.stepperGlyph}>−</Text>
          </Pressable>
          <Text style={styles.stepperValue}>
            {current} {unit}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Increase"
            style={styles.stepperBtn}
            onPress={() => {
              const next = Math.round((current + step) * 10) / 10;
              onChange(String(next));
              onBlur();
            }}
          >
            <Text style={styles.stepperGlyph}>+</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={field.label}
        value={value}
        onChangeText={onChange}
        onBlur={onBlur}
        multiline={field.type === "long_text"}
        keyboardType={field.type === "number" ? "decimal-pad" : "default"}
        style={field.type === "long_text" ? styles.input : styles.inputSingle}
        placeholder={field.helpText ?? ""}
        placeholderTextColor={colors.midGrey}
      />
    </View>
  );
}

export function CheckinScreen({
  relationship,
  checkin,
  onDone,
}: {
  relationship: CoachingRelationship;
  checkin: Checkin;
  onDone: () => void;
}) {
  const sync = useSyncEngine();
  const { api, me } = useAuth();
  const coach = coachFirstName(relationship);
  const timeZone = me?.timezone ?? "UTC";
  const today = localDateInTimezone(timeZone);

  const [form, setForm] = useState<CheckinFormVersion | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [recordVersion, setRecordVersion] = useState(checkin.recordVersion);
  const [step, setStep] = useState<Step>(
    checkin.recordStatus === "submitted" || checkin.status === "reviewed"
      ? "done"
      : "form",
  );
  const [acting, setActing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const introSubtitle = useMemo(() => {
    const due = formatCivilDate(checkin.localDate);
    return `Weekly check-in · takes about 3 min · Due ${due}, 11:59 pm`;
  }, [checkin.localDate]);

  const overdueCopy = useMemo(() => {
    if (checkin.status !== "overdue") return null;
    const yesterday = addDays(today, -1);
    if (checkin.localDate === yesterday) {
      return "This was due yesterday. You can still send it.";
    }
    return "This check-in is overdue. You can still send it.";
  }, [checkin.localDate, checkin.status, today]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const loaded = await api.getCheckinForm(checkin.id);
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

        const needsWeightPrefill = loaded.fields.some(
          (f) =>
            f.type === "measurement" &&
            f.measurementType === "body_weight_kg" &&
            !initial[f.id],
        );
        if (needsWeightPrefill) {
          try {
            const progress = await api.getProgressSummary(relationship.id);
            const latest = progress.measurements
              .filter((m) => m.type === "body_weight_kg")
              .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
            if (latest) {
              for (const field of loaded.fields) {
                if (
                  field.type === "measurement" &&
                  field.measurementType === "body_weight_kg"
                ) {
                  initial[field.id] = String(latest.value);
                }
              }
            }
          } catch {
            // Prefill is best-effort.
          }
        }

        setValues(initial);
        setOffline(false);
      } catch (err) {
        if (cancelled) return;
        setOffline(true);
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
              label: "Body weight",
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
        setError(
          err instanceof ApiClientError
            ? err.message
            : "Couldn't load the form. Showing a simple draft.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, checkin, relationship.id]);

  const fields = useMemo(() => form?.fields ?? [], [form]);
  const sections = useMemo(() => groupFields(fields), [fields]);

  const saveDraft = useCallback(async () => {
    if (!form || !canEditCheckin(checkin.status)) return;
    try {
      const answers = answersToPayload(fields, valuesRef.current);
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
      const syncMsg = messageFromSyncResults(results, coach);
      if (syncMsg) {
        setError(syncMsg);
        return;
      }
      const result =
        results.find((item) => item.recordId === checkin.id) ?? results[0];
      if (result?.serverVersion != null) {
        setRecordVersion(result.serverVersion);
      }
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [checkin.id, checkin.status, coach, fields, form, recordVersion, sync]);

  function scheduleDraftSave() {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      void saveDraft();
    }, 600);
  }

  useEffect(() => {
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, []);

  async function submit() {
    if (!form) return;
    setActing(true);
    setError(null);
    try {
      const answers = answersToPayload(fields, values);
      const wellbeing =
        answers.wellbeing ??
        values[fields.find((f) => f.required)?.id ?? ""] ??
        "OK";
      const { results } = await enqueueAndPush(sync, {
        recordId: checkin.id,
        operation: "checkin.submit",
        expectedServerVersion: recordVersion,
        payload: {
          checkinId: checkin.id,
          body: {
            expectedVersion: recordVersion,
            answers: {
              wellbeing,
              notes: answers.notes ?? null,
              bodyWeightKg: answers.bodyWeightKg ?? null,
              fieldAnswers: answers.fieldAnswers,
            },
          },
        },
      });
      const syncMsg = messageFromSyncResults(results, coach);
      if (syncMsg) {
        setError(syncMsg);
        return;
      }
      const result =
        results.find((item) => item.recordId === checkin.id) ?? results[0];
      if (result?.serverVersion != null) {
        setRecordVersion(result.serverVersion);
      }
      setStep("done");
      setOffline(false);
    } catch (err) {
      setOffline(true);
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Queued offline · will send when you're back.",
      );
      setStep("done");
    } finally {
      setActing(false);
    }
  }

  if (checkin.status === "reviewed" && checkin.review) {
    const reviewedOn = formatCivilDate(
      localDateInTimezone(timeZone, new Date(checkin.review.createdAt)),
      { includeWeekday: true },
    );
    return (
      <Screen chrome="app" title="Check-in" subtitle={`${coach} reviewed this · ${reviewedOn}`}>
        {error ? <ErrorBanner message={error} /> : null}
        <View style={styles.banner}>
          <Text style={styles.bannerTitle} accessibilityRole="header">
            {outcomeCopy(checkin.review.outcome, coach)}
          </Text>
          {checkin.review.notes ? (
            <View style={styles.coachNote}>
              <Text style={styles.coachNoteLabel}>Note from {coach}</Text>
              <Text style={styles.bannerBody}>{checkin.review.notes}</Text>
            </View>
          ) : null}
        </View>
        <PrimaryButton label="Back to Today" onPress={onDone} />
      </Screen>
    );
  }

  if (step === "done") {
    return (
      <Screen chrome="app" title="Check-in" subtitle="Sent">
        {error ? <ErrorBanner message={error} /> : null}
        {offline ? (
          <Text style={styles.offline}>You're offline · it will send when you're back</Text>
        ) : null}
        <View style={styles.banner}>
          <Text style={styles.bannerTitle} accessibilityRole="header">
            Sent. {coach} will review this.
          </Text>
          <Text style={styles.bannerBody}>
            Nothing else is required for this check-in.
          </Text>
        </View>
        <PrimaryButton label="Back to Today" onPress={onDone} />
      </Screen>
    );
  }

  if (step === "review") {
    return (
      <Screen chrome="app" title="Review" subtitle={`Send to ${coach}`}>
        {error ? <ErrorBanner message={error} /> : null}
        {offline ? (
          <Text style={styles.offline}>You're offline · submit will queue</Text>
        ) : null}
        <View style={styles.banner}>
          {fields.map((field) => {
            const raw = values[field.id];
            if (!raw) return null;
            return (
              <View key={field.id} style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>{field.label}</Text>
                <Text style={styles.reviewValue}>
                  {field.type === "yes_no"
                    ? raw === "yes"
                      ? "Yes"
                      : "No"
                    : field.type === "photo_intent"
                      ? "Photo noted"
                      : field.type === "measurement" &&
                          field.measurementType === "body_weight_kg"
                        ? `${raw} kg`
                        : raw}
                </Text>
              </View>
            );
          })}
        </View>
        <PrimaryButton
          label={acting ? "Sending…" : `Send to ${coach}`}
          disabled={acting}
          onPress={() => {
            void submit();
          }}
        />
        <PrimaryButton
          label="Back"
          variant="secondary"
          onPress={() => setStep("form")}
        />
        <PrimaryButton label="Cancel" variant="ghost" onPress={onDone} />
      </Screen>
    );
  }

  return (
    <Screen chrome="app" title="Check-in" subtitle={introSubtitle}>
      {error ? <ErrorBanner message={error} /> : null}
      {offline ? (
        <Text style={styles.offline}>Draft saved on phone · will sync later</Text>
      ) : null}
      {overdueCopy ? <Text style={styles.overdue}>{overdueCopy}</Text> : null}

      {loading && !form ? (
        <Text style={styles.muted} accessibilityLabel="Loading form">
          Loading form…
        </Text>
      ) : null}

      {!loading && !form ? (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Form unavailable</Text>
          <Text style={styles.bannerBody}>
            Pull back to Today and try again when you're online.
          </Text>
        </View>
      ) : null}

      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {section.title}
          </Text>
          {section.fields.map((field) => (
            <FieldControl
              key={field.id}
              field={field}
              value={values[field.id] ?? ""}
              onChange={(next) => {
                setValues((current) => ({ ...current, [field.id]: next }));
                scheduleDraftSave();
              }}
              onBlur={() => {
                void saveDraft();
              }}
            />
          ))}
        </View>
      ))}

      <PrimaryButton
        label="Review"
        disabled={!form || acting || !canEditCheckin(checkin.status)}
        onPress={() => setStep("review")}
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
        <Text style={styles.bannerTitle} accessibilityRole="header">
          Check-in
        </Text>
        <Text style={styles.bannerBody}>
          {checkin
            ? `Next check-in is scheduled for ${formatCivilDate(checkin.localDate)}.`
            : "No check-in is due right now."}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.banner}>
      <Text style={styles.bannerTitle} accessibilityRole="header">
        Weekly check-in · Due {formatCivilDate(checkin.localDate)}, 11:59 pm
      </Text>
      <Text style={styles.bannerBody}>Takes about 3 min</Text>
      <PrimaryButton label="Start" onPress={() => onOpen(checkin)} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    gap: spacing.sm,
    marginBottom: spacing.lg,
    padding: spacing.xl,
  },
  bannerTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
  bannerBody: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  coachNote: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  coachNoteLabel: {
    color: colors.deepNavy,
    fontSize: 13,
    fontWeight: "600",
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  field: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "600",
  },
  help: {
    color: colors.midGrey,
    fontSize: 13,
  },
  input: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: radii.card,
    borderWidth: 1,
    color: colors.nearBlack,
    minHeight: 96,
    padding: spacing.md,
    textAlignVertical: "top",
  },
  inputSingle: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: radii.card,
    borderWidth: 1,
    color: colors.nearBlack,
    minHeight: touchTargetMin,
    paddingHorizontal: spacing.md,
  },
  scaleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  scaleChip: {
    alignItems: "center",
    borderColor: colors.lightGrey,
    borderRadius: radii.card,
    borderWidth: 1,
    minHeight: touchTargetMin,
    minWidth: touchTargetMin,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  scaleChipOn: {
    backgroundColor: colors.paleLavender,
    borderColor: colors.indigo,
  },
  photoSlot: {
    alignItems: "center",
    borderColor: colors.lightGrey,
    borderRadius: radii.card,
    borderWidth: 1,
    minHeight: touchTargetMin,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  photoSlotText: {
    color: colors.nearBlack,
    fontSize: 14,
    fontWeight: "500",
  },
  stepperRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
  },
  stepperBtn: {
    alignItems: "center",
    borderColor: colors.lightGrey,
    borderRadius: radii.card,
    borderWidth: 1,
    height: touchTargetMin,
    justifyContent: "center",
    minWidth: touchTargetMin,
  },
  stepperGlyph: {
    color: colors.nearBlack,
    fontSize: 22,
    fontWeight: "600",
  },
  stepperValue: {
    color: colors.nearBlack,
    fontSize: 22,
    fontWeight: "700",
    minWidth: 96,
    textAlign: "center",
  },
  reviewRow: {
    borderBottomColor: colors.lightGrey,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
    paddingVertical: spacing.sm,
  },
  reviewLabel: {
    color: colors.midGrey,
    fontSize: 13,
  },
  reviewValue: {
    color: colors.nearBlack,
    fontSize: 15,
    fontWeight: "500",
  },
  overdue: {
    color: colors.darkGrey,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  muted: {
    color: colors.midGrey,
    fontSize: 14,
  },
  offline: {
    color: colors.midGrey,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
});
