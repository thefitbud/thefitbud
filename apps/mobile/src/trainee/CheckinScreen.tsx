import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import {
  Camera,
  Check,
  Minus,
  PersonStanding,
  Plus,
  RefreshCw,
} from "lucide-react-native";
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
import {
  colors,
  radii,
  semanticColors,
  spacing,
  touchTargetMin,
} from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { createIdempotencyKey } from "../lib/idempotency";
import { addDays, localDateInTimezone } from "../lib/dates";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";
import { messageFromSyncResults, subscribeAll } from "./dataCache";
import {
  pickNextScheduledCheckin,
  pickTodayCheckin,
} from "./pickTodayCheckin";

type Step = "form" | "review" | "done";

const WIZARD_STEPS = [
  {
    label: "Measurements",
    sectionTitles: ["Measurements", "Photos"],
  },
  {
    label: "How was your week",
    sectionTitles: ["How was your week"],
  },
  {
    label: "Reflection",
    sectionTitles: ["Reflection"],
  },
] as const;

function coachFirstName(relationship: CoachingRelationship): string {
  const raw = relationship.trainerDisplayName?.trim();
  if (!raw) return "Your coach";
  return raw.split(/\s+/)[0] ?? raw;
}

export function outcomeCopy(
  outcome: CheckinReviewOutcome,
  coach: string,
): string {
  switch (outcome) {
    case "acknowledged":
      return "Acknowledged";
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
  // Scheduled (not yet due) is read-only — show "Next check-in …" instead.
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
  lastWeightLabel,
}: {
  field: CheckinFieldDefinition;
  value: string;
  onChange: (next: string) => void;
  onBlur: () => void;
  lastWeightLabel?: string | null;
}) {
  const label = `${field.label}${field.required ? " *" : ""}`;

  if (field.type === "scale_1_5") {
    return (
      <View style={styles.field}>
        <Text style={styles.qLabel}>{field.label}</Text>
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
              <Text
                style={[
                  styles.scaleChipText,
                  value === String(n) ? styles.scaleChipTextOn : null,
                ]}
              >
                {n}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.scaleAnch}>
          <Text style={styles.help}>{field.lowLabel ?? "Very low"}</Text>
          <Text style={styles.help}>{field.highLabel ?? "Very high"}</Text>
        </View>
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
    const slot =
      field.photoSlot === "front"
        ? "Front"
        : field.photoSlot === "side"
          ? "Side"
          : field.photoSlot === "back"
            ? "Back"
            : field.label;
    const noted = value === "noted";
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${slot} photo`}
        style={[styles.phTile, noted ? styles.phTileDone : styles.phTileEmpty]}
        onPress={() => {
          onChange(noted ? "" : "noted");
          onBlur();
        }}
      >
        {noted ? (
          <>
            <PersonStanding
              size={64}
              color="rgba(26, 18, 72, 0.28)"
              strokeWidth={1.75}
            />
            <View style={styles.phOk}>
              <Check size={13} color={semanticColors.positive.text} strokeWidth={3} />
            </View>
            <Text style={styles.phTileLabel}>{slot}</Text>
          </>
        ) : (
          <>
            <Camera size={24} color={colors.indigo} strokeWidth={1.75} />
            <Text style={styles.phTileLabel}>{slot}</Text>
            <Text style={styles.phTileSub}>Add photo</Text>
          </>
        )}
      </Pressable>
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
    if (field.measurementType === "body_weight_kg") {
      return (
        <View style={styles.wbig}>
          <View>
            <Text style={styles.ov}>Weight</Text>
            <Text style={styles.wbigVal}>
              {current}
              <Text style={styles.wbigUnit}>kg</Text>
            </Text>
            {lastWeightLabel ? (
              <Text style={styles.lastWeight}>Last: {lastWeightLabel}</Text>
            ) : null}
          </View>
          <View style={styles.rstp}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decrease weight"
              style={styles.rstpBtn}
              onPress={() => {
                const next = Math.round((current - step) * 10) / 10;
                onChange(String(next));
                onBlur();
              }}
            >
              <Minus size={22} color={colors.indigo} strokeWidth={2} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Increase weight"
              style={styles.rstpBtn}
              onPress={() => {
                const next = Math.round((current + step) * 10) / 10;
                onChange(String(next));
                onBlur();
              }}
            >
              <Plus size={22} color={colors.indigo} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.mrow2}>
        <View>
          <Text style={styles.mrowTitle}>{field.label}</Text>
          {field.helpText ? (
            <Text style={styles.help}>{field.helpText}</Text>
          ) : (
            <Text style={styles.help}>Measure at the navel</Text>
          )}
        </View>
        <View style={styles.stp}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Decrease"
            style={styles.stpBtn}
            onPress={() => {
              const next = Math.round((current - step) * 10) / 10;
              onChange(String(next));
              onBlur();
            }}
          >
            <Minus size={18} color={colors.indigo} strokeWidth={2.2} />
          </Pressable>
          <Text style={styles.stpVal}>
            {current}
            <Text style={styles.stpUnit}>{unit}</Text>
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Increase"
            style={styles.stpBtn}
            onPress={() => {
              const next = Math.round((current + step) * 10) / 10;
              onChange(String(next));
              onBlur();
            }}
          >
            <Plus size={18} color={colors.indigo} strokeWidth={2.2} />
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
  const [wizardStep, setWizardStep] = useState(0);
  const [lastWeightLabel, setLastWeightLabel] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(
    checkin.recordStatus === "submitted" || checkin.status === "reviewed"
      ? "done"
      : "form",
  );
  const [acting, setActing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftInFlight = useRef<Promise<void> | null>(null);
  const recordVersionRef = useRef(recordVersion);
  recordVersionRef.current = recordVersion;
  const valuesRef = useRef(values);
  valuesRef.current = values;

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
              const lastDate = formatCivilDate(
                localDateInTimezone(timeZone, new Date(latest.observedAt)),
                { includeWeekday: true },
              );
              const rounded =
                Math.round(latest.value * 10) / 10;
              setLastWeightLabel(
                `${lastDate} · ${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} kg`,
              );
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
  const visibleSections = useMemo(() => {
    const allowed = new Set(
      WIZARD_STEPS[wizardStep]?.sectionTitles ?? WIZARD_STEPS[0].sectionTitles,
    );
    return sections.filter((section) =>
      (allowed as Set<string>).has(section.title),
    );
  }, [sections, wizardStep]);

  const saveDraft = useCallback(async () => {
    if (!form || !canEditCheckin(checkin.status)) return;
    const expected = recordVersionRef.current;
    const run = (async () => {
      try {
        const answers = answersToPayload(fields, valuesRef.current);
        const { results } = await enqueueAndPush(sync, {
          recordId: checkin.id,
          operation: "checkin.save_draft",
          expectedServerVersion: expected,
          payload: {
            checkinId: checkin.id,
            body: {
              expectedVersion: expected,
              answers,
            },
          },
        });
        const syncMsg = messageFromSyncResults(results, coach);
        if (syncMsg) {
          // Stale etag after overlapping saves — refetch authoritative version.
          if (
            results.some(
              (item) => item.error?.code === "CHECKIN_VERSION_CONFLICT",
            )
          ) {
            try {
              const fresh = await api.getCheckin(checkin.id);
              recordVersionRef.current = fresh.recordVersion;
              setRecordVersion(fresh.recordVersion);
            } catch {
              // keep local version
            }
          }
          setError(syncMsg);
          return;
        }
        const result =
          results.find((item) => item.recordId === checkin.id) ?? results[0];
        if (result?.serverVersion != null) {
          recordVersionRef.current = result.serverVersion;
          setRecordVersion(result.serverVersion);
        }
        setOffline(false);
        setDraftSavedAt(new Date());
      } catch {
        setOffline(true);
      }
    })();
    draftInFlight.current = run;
    try {
      await run;
    } finally {
      if (draftInFlight.current === run) draftInFlight.current = null;
    }
  }, [api, checkin.id, checkin.status, coach, fields, form, sync]);

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
    if (!canEditCheckin(checkin.status)) {
      setError(
        `Next check-in ${formatCivilDate(checkin.localDate, { includeWeekday: true })}.`,
      );
      return;
    }
    setActing(true);
    setError(null);
    try {
      // Cancel debounce and wait for any in-flight draft, then refetch the
      // authoritative etag. Do NOT saveDraft again here — a second draft with
      // the same expectedVersion races submit and loops CHECKIN_VERSION_CONFLICT.
      if (draftTimer.current) {
        clearTimeout(draftTimer.current);
        draftTimer.current = null;
      }
      if (draftInFlight.current) {
        await draftInFlight.current;
      }
      try {
        const fresh = await api.getCheckin(checkin.id);
        recordVersionRef.current = fresh.recordVersion;
        setRecordVersion(fresh.recordVersion);
        if (
          fresh.recordStatus === "submitted" ||
          fresh.status === "reviewed"
        ) {
          setStep("done");
          setOffline(false);
          return;
        }
      } catch {
        // keep ref
      }
      const expected = recordVersionRef.current;
      const answers = answersToPayload(fields, values);
      const wellbeing =
        answers.wellbeing ??
        values[fields.find((f) => f.required)?.id ?? ""] ??
        "OK";
      const { results } = await enqueueAndPush(sync, {
        recordId: checkin.id,
        operation: "checkin.submit",
        expectedServerVersion: expected,
        payload: {
          checkinId: checkin.id,
          body: {
            expectedVersion: expected,
            answers: {
              wellbeing,
              notes: answers.notes ?? null,
              bodyWeightKg: answers.bodyWeightKg ?? null,
              fieldAnswers: answers.fieldAnswers,
            },
          },
        },
      });
      const conflict = results.some(
        (item) => item.error?.code === "CHECKIN_VERSION_CONFLICT",
      );
      if (conflict) {
        try {
          const fresh = await api.getCheckin(checkin.id);
          recordVersionRef.current = fresh.recordVersion;
          setRecordVersion(fresh.recordVersion);
          if (
            fresh.recordStatus === "submitted" ||
            fresh.status === "reviewed"
          ) {
            // Already accepted — never surface "changed after this version".
            setStep("done");
            setOffline(false);
            return;
          }
          // Retry once with the fresh etag (no intervening draft).
          const retry = await enqueueAndPush(sync, {
            recordId: checkin.id,
            operation: "checkin.submit",
            expectedServerVersion: fresh.recordVersion,
            payload: {
              checkinId: checkin.id,
              body: {
                expectedVersion: fresh.recordVersion,
                answers: {
                  wellbeing,
                  notes: answers.notes ?? null,
                  bodyWeightKg: answers.bodyWeightKg ?? null,
                  fieldAnswers: answers.fieldAnswers,
                },
              },
            },
          });
          const retryMsg = messageFromSyncResults(retry.results, coach);
          if (retryMsg) {
            setError(retryMsg);
            return;
          }
          const retryResult =
            retry.results.find((item) => item.recordId === checkin.id) ??
            retry.results[0];
          if (retryResult?.serverVersion != null) {
            recordVersionRef.current = retryResult.serverVersion;
            setRecordVersion(retryResult.serverVersion);
          }
          setStep("done");
          setOffline(false);
          return;
        } catch {
          // fall through
        }
      }
      const syncMsg = messageFromSyncResults(results, coach);
      if (syncMsg) {
        setError(syncMsg);
        return;
      }
      const result =
        results.find((item) => item.recordId === checkin.id) ?? results[0];
      if (result?.serverVersion != null) {
        recordVersionRef.current = result.serverVersion;
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

  if (checkin.status === "scheduled") {
    return (
      <Screen chrome="app" title="Check-in">
        <View style={styles.banner}>
          <Text style={styles.bannerTitle} accessibilityRole="header">
            Next check-in{" "}
            {formatCivilDate(checkin.localDate, { includeWeekday: true })}
          </Text>
          <Text style={styles.bannerBody}>
            You can fill this in when it opens. Nothing to do until then.
          </Text>
        </View>
        <PrimaryButton label="Back to Today" onPress={onDone} />
      </Screen>
    );
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

  const dueLabel = `Due ${formatCivilDate(checkin.localDate)}, 11:59 pm`;
  const draftTimeLabel = draftSavedAt
    ? new Intl.DateTimeFormat("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        timeZone,
      }).format(draftSavedAt)
    : null;

  const formFooter = (
    <View style={styles.abar}>
      <PrimaryButton
        label="Continue"
        disabled={!form || acting || !canEditCheckin(checkin.status)}
        onPress={() => {
          if (wizardStep < WIZARD_STEPS.length - 1) {
            setWizardStep((index) => index + 1);
          } else {
            setStep("review");
          }
        }}
      />
      {draftTimeLabel ? (
        <View style={styles.savedRow}>
          <RefreshCw size={16} color={colors.midGrey} strokeWidth={1.75} />
          <Text style={styles.savedText}>
            Draft saved on your phone · {draftTimeLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen chrome="app" title="Check-in" showHeader={false} footer={formFooter}>
      <View style={styles.topnav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onDone}
          style={styles.closeBtn}
        >
          <Text style={styles.closeLabel}>Close</Text>
        </Pressable>
        <Text style={styles.topTitle}>Weekly check-in</Text>
        <View style={styles.topRight} />
      </View>

      <View style={styles.steps3}>
        {WIZARD_STEPS.map((_, index) => (
          <View
            key={`wizard-seg-${index}`}
            style={[
              styles.stepSeg,
              index <= wizardStep ? styles.stepSegOn : null,
            ]}
          />
        ))}
      </View>
      <View style={styles.stepl}>
        <Text style={styles.steplMain} numberOfLines={1}>
          <Text style={styles.steplBold}>{WIZARD_STEPS[wizardStep]?.label}</Text>
          {" · step "}
          {wizardStep + 1} of {WIZARD_STEPS.length}
        </Text>
        <Text style={styles.steplDue}>{dueLabel}</Text>
      </View>
      <Text style={styles.intro}>
        Takes about 3 min. Only {coach} sees your answers and photos.
      </Text>

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

      {visibleSections.map((section) => {
        const isPhotos = section.title === "Photos";
        const isMeasurements = section.title === "Measurements";
        return (
          <View key={section.title} style={styles.section}>
            <View style={styles.sh}>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                {section.title}
                {isPhotos ? (
                  <Text style={styles.sectionCnt}> optional</Text>
                ) : null}
              </Text>
              {isPhotos ? (
                <Pressable accessibilityRole="button">
                  <Text style={styles.shLink}>How to</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={isMeasurements || isPhotos ? styles.cardPad : null}>
              {isPhotos ? (
                <View style={styles.ph3}>
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
              ) : (
                section.fields.map((field) => (
                  <FieldControl
                    key={field.id}
                    field={field}
                    value={values[field.id] ?? ""}
                    lastWeightLabel={lastWeightLabel}
                    onChange={(next) => {
                      setValues((current) => ({ ...current, [field.id]: next }));
                      scheduleDraftSave();
                    }}
                    onBlur={() => {
                      void saveDraft();
                    }}
                  />
                ))
              )}
            </View>
          </View>
        );
      })}
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
  const [nextScheduled, setNextScheduled] = useState<Checkin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await api.ensureDueCheckin(relationship.id, createIdempotencyKey());
      const listed = await api.listCheckins(relationship.id);
      setCheckin(pickTodayCheckin(listed.items));
      setNextScheduled(pickNextScheduledCheckin(listed.items));
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
  }, [load, refreshNonce]);

  useEffect(() => {
    return subscribeAll(() => {
      setRefreshNonce((value) => value + 1);
    });
  }, []);

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

  if (!checkin) {
    return (
      <View style={styles.banner}>
        <Text style={styles.bannerTitle} accessibilityRole="header">
          Check-in
        </Text>
        <Text style={styles.bannerBody}>No check-in is due right now.</Text>
      </View>
    );
  }

  if (checkin.status === "scheduled") {
    return (
      <View style={styles.banner}>
        <Text style={styles.bannerTitle} accessibilityRole="header">
          Next check-in{" "}
          {formatCivilDate(checkin.localDate, { includeWeekday: true })}
        </Text>
        <Text style={styles.bannerBody}>
          You can fill this in when it opens.
        </Text>
      </View>
    );
  }

  if (checkin.status === "reviewed" && checkin.review) {
    const coach =
      relationship.trainerDisplayName?.trim().split(/\s+/)[0] || "your coach";
    return (
      <View style={styles.banner}>
        <Text style={styles.bannerTitle} accessibilityRole="header">
          {outcomeCopy(checkin.review.outcome, coach)}
        </Text>
        {checkin.review.notes ? (
          <Text style={styles.bannerBody}>{checkin.review.notes}</Text>
        ) : (
          <Text style={styles.bannerBody}>
            {coach} reviewed your check-in.
          </Text>
        )}
        {nextScheduled ? (
          <Text style={styles.bannerBody}>
            Next check-in{" "}
            {formatCivilDate(nextScheduled.localDate, { includeWeekday: true })}
          </Text>
        ) : null}
        <PrimaryButton
          label="See check-in"
          variant="secondary"
          onPress={() => onOpen(checkin)}
        />
      </View>
    );
  }

  if (checkin.status === "submitted") {
    return (
      <View style={styles.banner}>
        <Text style={styles.bannerTitle} accessibilityRole="header">
          Check-in sent
        </Text>
        <Text style={styles.bannerBody}>
          Waiting for {relationship.trainerDisplayName?.split(/\s+/)[0] ?? "your coach"} to
          review.
        </Text>
        <PrimaryButton
          label="See check-in"
          variant="secondary"
          onPress={() => onOpen(checkin)}
        />
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
  topnav: {
    alignItems: "center",
    flexDirection: "row",
    height: 48,
    marginBottom: spacing.xs,
  },
  closeBtn: {
    justifyContent: "center",
    minHeight: 44,
    paddingLeft: 2,
  },
  closeLabel: {
    color: colors.indigo,
    fontSize: 16,
    fontWeight: "600",
  },
  topTitle: {
    color: colors.deepNavy,
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  topRight: {
    width: 52,
  },
  steps3: {
    flexDirection: "row",
    gap: 6,
    marginBottom: spacing.xs,
    paddingHorizontal: 4,
  },
  stepSeg: {
    backgroundColor: colors.lightGrey,
    borderRadius: 2,
    flex: 1,
    height: 4,
  },
  stepSegOn: {
    backgroundColor: colors.indigo,
  },
  stepl: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    paddingHorizontal: 4,
  },
  steplMain: {
    color: colors.darkGrey,
    fontSize: 14,
  },
  steplBold: {
    color: colors.deepNavy,
    fontWeight: "700",
  },
  steplDue: {
    color: colors.midGrey,
    fontSize: 14,
  },
  intro: {
    color: colors.midGrey,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: spacing.md,
    paddingHorizontal: 4,
  },
  sh: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  shLink: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
  sectionCnt: {
    color: colors.midGrey,
    fontSize: 15,
    fontWeight: "600",
  },
  cardPad: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing.lg,
  },
  ov: {
    color: colors.midGrey,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  wbig: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  wbigVal: {
    color: colors.deepNavy,
    fontSize: 40,
    fontWeight: "700",
    letterSpacing: -1.2,
    lineHeight: 44,
  },
  wbigUnit: {
    color: colors.midGrey,
    fontSize: 18,
    fontWeight: "600",
  },
  lastWeight: {
    color: colors.midGrey,
    fontSize: 14,
    marginTop: 4,
  },
  rstp: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  rstpBtn: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: "#E7E9F2",
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  mrow2: {
    alignItems: "center",
    borderTopColor: "#E7E9F2",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  mrowTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
  stp: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: "#E7E9F2",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
  },
  stpBtn: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  stpVal: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
    minWidth: 52,
    textAlign: "center",
  },
  stpUnit: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "500",
  },
  ph3: {
    flexDirection: "row",
    gap: 10,
  },
  phTile: {
    alignItems: "center",
    borderRadius: 18,
    flex: 1,
    height: 128,
    justifyContent: "flex-end",
    overflow: "hidden",
    paddingBottom: 10,
  },
  phTileDone: {
    backgroundColor: "#D9D3F7",
  },
  phTileEmpty: {
    backgroundColor: colors.white,
    borderColor: "#D5D6DE",
    borderStyle: "dashed",
    borderWidth: 1.5,
    justifyContent: "center",
    gap: 6,
    paddingBottom: 0,
  },
  phOk: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: 11,
    height: 22,
    justifyContent: "center",
    position: "absolute",
    right: 8,
    top: 8,
    width: 22,
  },
  phTileLabel: {
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "600",
  },
  phTileSub: {
    color: colors.midGrey,
    fontSize: 12,
    fontWeight: "500",
  },
  qLabel: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  scaleChipText: {
    color: colors.darkGrey,
    fontSize: 16,
    fontWeight: "600",
  },
  scaleChipTextOn: {
    color: colors.indigo,
  },
  scaleAnch: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  abar: {
    gap: spacing.sm,
  },
  savedRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
  },
  savedText: {
    color: colors.midGrey,
    fontSize: 13,
  },
});
