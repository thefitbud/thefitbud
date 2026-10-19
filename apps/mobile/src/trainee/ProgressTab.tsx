import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CoachingRelationship,
  Measurement,
  MeasurementType,
  MediaAsset,
  ProgressSummary,
} from "@fitbud/contracts";
import { formatCivilDate } from "@fitbud/core";
import { colors, radii, spacing, touchTargetMin } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { BottomSheet } from "../components/BottomSheet";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { createIdempotencyKey } from "../lib/idempotency";
import { localDateInTimezone } from "../lib/dates";
import {
  MINIMAL_PNG_CONTENT_TYPE,
  minimalPngBytes,
} from "../lib/minimalPng";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";
import {
  getCached,
  messageFromSyncResults,
  setCached,
  subscribe,
} from "./dataCache";

const BODY_TYPES: MeasurementType[] = [
  "body_weight_kg",
  "waist_cm",
  "hip_cm",
  "chest_cm",
];

const PROGRESS_CACHE_PREFIX = "progress";

function progressCacheKey(relationshipId: string): string {
  return `${PROGRESS_CACHE_PREFIX}:${relationshipId}`;
}

function civilFromObservedAt(iso: string, timeZone: string): string {
  return localDateInTimezone(timeZone, new Date(iso));
}

function formatKg(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatDeltaKg(delta: number): string {
  const abs = formatKg(Math.abs(delta));
  if (delta > 0) return `+${abs} kg`;
  if (delta < 0) return `−${abs} kg`;
  return "0 kg";
}

function latestOfType(
  measurements: Measurement[],
  type: MeasurementType,
): Measurement | null {
  const rows = measurements
    .filter((m) => m.type === type)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  return rows[0] ?? null;
}

function weightSeriesLast12Weeks(
  measurements: Measurement[],
  timeZone: string,
): Array<{ date: string; value: number }> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 84);
  const cutoffIso = cutoff.toISOString();
  return measurements
    .filter(
      (m) => m.type === "body_weight_kg" && m.observedAt >= cutoffIso,
    )
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
    .map((m) => ({
      date: civilFromObservedAt(m.observedAt, timeZone),
      value: m.value,
    }));
}

function Sparkline({ values }: { values: number[] }) {
  const width = 280;
  const height = 64;
  if (values.length < 2) {
    return (
      <View style={[styles.sparkEmpty, { width, height }]}>
        <Text style={styles.muted}>Log another weigh-in to see a trend.</Text>
      </View>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (width - 8) + 4;
      const y = height - 8 - ((v - min) / range) * (height - 16);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <Svg
      width={width}
      height={height}
      accessibilityLabel="Weight trend over twelve weeks"
    >
      <Polyline
        points={points}
        fill="none"
        stroke={colors.indigo}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function ProgressTab({
  relationship,
}: {
  relationship: CoachingRelationship;
}) {
  const { api, me, refreshSession } = useAuth();
  const timeZone = me?.timezone ?? "UTC";
  const sync = useSyncEngine();
  const cacheKey = progressCacheKey(relationship.id);

  const [summary, setSummary] = useState<ProgressSummary | null>(
    () => getCached<ProgressSummary>(cacheKey) ?? null,
  );
  const [loading, setLoading] = useState(!summary);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logType, setLogType] = useState<MeasurementType>("body_weight_kg");
  const [stepValue, setStepValue] = useState(70);
  const [compareMode, setCompareMode] = useState(false);
  const [comparePick, setComparePick] = useState<string[]>([]);
  const [confirmOdd, setConfirmOdd] = useState<number | null>(null);

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!opts?.soft) setLoading(true);
      setError(null);
      try {
        const result = await api.getProgressSummary(relationship.id);
        setSummary(result);
        setCached(cacheKey, result);
        setOffline(false);
      } catch (err) {
        setOffline(true);
        const cached = getCached<ProgressSummary>(cacheKey);
        if (cached) {
          setSummary(cached);
        } else {
          const local = await sync.store.listLocal("measurement");
          if (local.length > 0) {
            const measurements = local
              .filter((row) => !row.tombstone && row.payloadJson)
              .map(
                (row) =>
                  JSON.parse(row.payloadJson!) as ProgressSummary["measurements"][number],
              );
            const fallback: ProgressSummary = {
              measurements,
              entries: [],
              media: [],
            };
            setSummary(fallback);
            setCached(cacheKey, fallback);
          } else {
            setError(
              err instanceof ApiClientError
                ? err.message
                : "Could not load progress.",
            );
          }
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, cacheKey, relationship.id, sync],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribe(cacheKey, () => {
      const next = getCached<ProgressSummary>(cacheKey);
      if (next) setSummary(next);
    });
  }, [cacheKey]);

  const measurements = summary?.measurements ?? [];
  const media = summary?.media ?? [];
  const weights = useMemo(
    () =>
      measurements
        .filter((m) => m.type === "body_weight_kg")
        .sort((a, b) => a.observedAt.localeCompare(b.observedAt)),
    [measurements],
  );
  const latestWeight = weights.length > 0 ? weights[weights.length - 1]! : null;
  const firstWeight = weights[0] ?? null;
  const series = useMemo(
    () => weightSeriesLast12Weeks(measurements, timeZone),
    [measurements, timeZone],
  );

  const empty =
    !loading &&
    measurements.length === 0 &&
    (summary?.entries.length ?? 0) === 0 &&
    media.length === 0;

  const changeCopy = useMemo(() => {
    if (!latestWeight || !firstWeight || latestWeight.id === firstWeight.id) {
      return null;
    }
    const delta = latestWeight.value - firstWeight.value;
    const since = formatCivilDate(
      civilFromObservedAt(firstWeight.observedAt, timeZone),
      { includeWeekday: false },
    );
    return `${formatDeltaKg(delta)} since ${since}`;
  }, [firstWeight, latestWeight, timeZone]);

  function openLog(type: MeasurementType) {
    const last = latestOfType(measurements, type);
    const fallback =
      type === "body_weight_kg"
        ? (latestWeight?.value ?? 70)
        : (last?.value ?? 80);
    setLogType(type);
    setStepValue(Math.round(fallback * 10) / 10);
    setConfirmOdd(null);
    setLogOpen(true);
  }

  async function saveMeasurement(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid measurement.");
      return;
    }
    if (logType === "body_weight_kg" && (value < 30 || value > 250) && confirmOdd !== value) {
      setConfirmOdd(value);
      return;
    }
    setActing(true);
    setError(null);
    setConfirmOdd(null);
    try {
      const measurementId = createIdempotencyKey();
      const unit = logType === "body_weight_kg" ? "kg" : "cm";
      const observedAt = new Date().toISOString();
      const { results } = await enqueueAndPush(sync, {
        mutationId: measurementId,
        idempotencyKey: measurementId,
        recordId: measurementId,
        operation: "measurement.create",
        payload: {
          coachingRelationshipId: relationship.id,
          id: measurementId,
          body: {
            id: measurementId,
            type: logType,
            value,
            unit,
            observedAt,
          },
        },
        localPayload: {
          id: measurementId,
          coachingRelationshipId: relationship.id,
          traineeUserId: me?.userId ?? relationship.traineeUserId,
          type: logType,
          value,
          unit,
          observedAt,
          source: "trainee_entry",
          checkinId: null,
          mediaAssetId: null,
          recordVersion: 0,
          createdAt: observedAt,
          updatedAt: observedAt,
        },
      });
      const syncMsg = messageFromSyncResults(results);
      if (syncMsg) {
        setError(syncMsg);
      }
      setLogOpen(false);
      const optimistic: ProgressSummary = {
        measurements: [
          {
            id: measurementId,
            coachingRelationshipId: relationship.id,
            traineeUserId: me?.userId ?? relationship.traineeUserId,
            type: logType,
            value,
            unit,
            observedAt,
            source: "trainee_entry",
            checkinId: null,
            mediaAssetId: null,
            recordVersion: 0,
            createdAt: observedAt,
            updatedAt: observedAt,
          },
          ...(summary?.measurements ?? []),
        ],
        entries: summary?.entries ?? [],
        media: summary?.media ?? [],
      };
      setSummary(optimistic);
      setCached(cacheKey, optimistic);
      await load({ soft: true });
      await sync.pullAndApply().catch(() => undefined);
    } catch (err) {
      setOffline(true);
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Saved on phone · will sync when online.",
      );
      setLogOpen(false);
    } finally {
      setActing(false);
    }
  }

  async function addProgressPhoto() {
    setActing(true);
    setError(null);
    try {
      await sync.enqueueFileUpload({
        coachingRelationshipId: relationship.id,
        mediaType: "progress_photo",
        contentType: MINIMAL_PNG_CONTENT_TYPE,
        localUri: "local://progress.png",
        byteSize: minimalPngBytes().byteLength,
      });
      const target = await api.createUploadTarget(
        {
          coachingRelationshipId: relationship.id,
          mediaType: "progress_photo",
          contentType: MINIMAL_PNG_CONTENT_TYPE,
          originalFilename: "progress.png",
        },
        createIdempotencyKey(),
      );
      await api.uploadMediaContent(
        target.uploadUrl,
        minimalPngBytes(),
        MINIMAL_PNG_CONTENT_TYPE,
      );
      await api.createProgressEntry(
        relationship.id,
        {
          entryType: "progress_photo",
          title: "Progress photo",
          mediaAssetId: target.mediaAsset.id,
        },
        createIdempotencyKey(),
      );
      await load({ soft: true });
    } catch (err) {
      setOffline(true);
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Photo queued · will upload when online.",
      );
    } finally {
      setActing(false);
    }
  }

  function toggleComparePick(id: string) {
    setComparePick((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1]!, id];
      return [...prev, id];
    });
  }

  const bodyMeasurements = BODY_TYPES.filter((t) => t !== "body_weight_kg")
    .map((type) => ({ type, latest: latestOfType(measurements, type) }))
    .filter((row) => row.latest != null);

  const photosByDate = useMemo(() => {
    const groups = new Map<string, MediaAsset[]>();
    for (const item of media.filter((m) => m.mediaType === "progress_photo")) {
      const day = civilFromObservedAt(item.uploadedAt ?? item.createdAt, timeZone);
      const list = groups.get(day) ?? [];
      list.push(item);
      groups.set(day, list);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [media, timeZone]);

  const logUnit = logType === "body_weight_kg" ? "kg" : "cm";
  const logStep = logType === "body_weight_kg" ? 0.1 : 0.5;
  const logTitle =
    logType === "body_weight_kg"
      ? "Log weight"
      : logType === "waist_cm"
        ? "Log waist"
        : logType === "hip_cm"
          ? "Log hip"
          : logType === "chest_cm"
            ? "Log chest"
            : "Log measurement";

  return (
    <Screen
      chrome="app"
      title="Progress"
      showHeader={false}
      refreshing={refreshing || loading}
      onRefresh={() => {
        setRefreshing(true);
        void refreshSession?.();
        void load({ soft: true });
      }}
    >
      {error ? <ErrorBanner message={error} /> : null}
      {offline ? (
        <Text style={styles.offline}>Saved on phone · showing last sync</Text>
      ) : null}

      {loading && !summary ? (
        <Text style={styles.muted} accessibilityLabel="Loading progress">
          Loading progress…
        </Text>
      ) : null}

      {empty ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle} accessibilityRole="header">
            Your progress will show here. Start with your weight today.
          </Text>
          <PrimaryButton label="Log weight" onPress={() => openLog("body_weight_kg")} />
        </View>
      ) : null}

      {!empty && latestWeight ? (
        <View style={styles.panel}>
          <Text style={styles.kicker}>Weight</Text>
          <Text style={styles.weightValue} accessibilityRole="header">
            {formatKg(latestWeight.value)} kg
          </Text>
          {changeCopy ? (
            <Text style={styles.changeNeutral}>{changeCopy}</Text>
          ) : (
            <Text style={styles.muted}>First weigh-in logged</Text>
          )}
          <View style={styles.sparkWrap}>
            <Sparkline values={series.map((p) => p.value)} />
          </View>
          <PrimaryButton label="Log weight" onPress={() => openLog("body_weight_kg")} />
          <Text style={styles.tip}>
            Weigh in at the same time each week for a clearer trend.
          </Text>
        </View>
      ) : null}

      {!empty && !latestWeight ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle} accessibilityRole="header">
            Weight
          </Text>
          <PrimaryButton label="Log weight" onPress={() => openLog("body_weight_kg")} />
        </View>
      ) : null}

      <View style={styles.panel}>
        <Text style={styles.panelTitle} accessibilityRole="header">
          Measurements
        </Text>
        {bodyMeasurements.length === 0 ? (
          <Text style={styles.muted}>Waist, hip and chest appear once logged.</Text>
        ) : (
          bodyMeasurements.map(({ type, latest }) => (
            <Pressable
              key={type}
              accessibilityRole="button"
              accessibilityLabel={`Log ${type === "waist_cm" ? "waist" : type === "hip_cm" ? "hip" : "chest"}`}
              style={styles.measureRow}
              onPress={() => openLog(type)}
            >
              <Text style={styles.rowTitle}>
                {type === "waist_cm"
                  ? "Waist"
                  : type === "hip_cm"
                    ? "Hip"
                    : "Chest"}
              </Text>
              <Text style={styles.rowMeta}>
                {latest ? `${formatKg(latest.value)} cm` : "—"}
              </Text>
            </Pressable>
          ))
        )}
        <PrimaryButton
          label="Add other"
          variant="secondary"
          onPress={() => openLog("other")}
        />
      </View>

      <View style={styles.panel}>
        <View style={styles.photosHeader}>
          <Text style={styles.panelTitle} accessibilityRole="header">
            Photos
          </Text>
          {media.length >= 2 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={compareMode ? "Exit compare" : "Compare photos"}
              style={styles.compareBtn}
              onPress={() => {
                setCompareMode((v) => !v);
                setComparePick([]);
              }}
            >
              <Text style={styles.compareLabel}>
                {compareMode ? "Done" : "Compare"}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {photosByDate.length === 0 ? (
          <Text style={styles.muted}>
            Add front, side or back photos to track shape over time.
          </Text>
        ) : (
          photosByDate.map(([day, items]) => (
            <View key={day} style={styles.photoGroup}>
              <Text style={styles.photoDate}>
                {formatCivilDate(day, { includeWeekday: false })}
              </Text>
              <View style={styles.photoGrid}>
                {items.map((item) => {
                  const selected = comparePick.includes(item.id);
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityLabel={
                        compareMode
                          ? selected
                            ? "Deselect photo"
                            : "Select photo to compare"
                          : "Progress photo"
                      }
                      style={[
                        styles.photoTile,
                        selected ? styles.photoTileSelected : null,
                      ]}
                      onPress={() => {
                        if (compareMode) toggleComparePick(item.id);
                      }}
                    >
                      <View style={styles.photoPlaceholder}>
                        <Text style={styles.photoPlaceholderText}>Photo</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        )}
        {compareMode && comparePick.length === 2 ? (
          <Text style={styles.tip}>
            Comparing two photos · tap Done when finished.
          </Text>
        ) : null}
        <PrimaryButton
          label={acting ? "Adding…" : "Add photos"}
          variant="secondary"
          disabled={acting}
          onPress={() => {
            void addProgressPhoto();
          }}
        />
      </View>

      <BottomSheet
        visible={logOpen}
        title={logTitle}
        subtitle="Adjust with the stepper, then save."
        onDismiss={() => setLogOpen(false)}
      >
        <View style={styles.stepperRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Decrease"
            style={styles.stepperBtn}
            onPress={() =>
              setStepValue((v) => Math.round((v - logStep) * 10) / 10)
            }
          >
            <Text style={styles.stepperGlyph}>−</Text>
          </Pressable>
          <Text style={styles.stepperValue}>
            {formatKg(stepValue)} {logUnit}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Increase"
            style={styles.stepperBtn}
            onPress={() =>
              setStepValue((v) => Math.round((v + logStep) * 10) / 10)
            }
          >
            <Text style={styles.stepperGlyph}>+</Text>
          </Pressable>
        </View>
        {confirmOdd != null ? (
          <Text style={styles.confirmOdd}>
            {formatKg(confirmOdd)} kg looks unusual. Tap Save again to confirm.
          </Text>
        ) : null}
        <PrimaryButton
          label={acting ? "Saving…" : "Save"}
          disabled={acting}
          onPress={() => {
            void saveMeasurement(stepValue);
          }}
        />
        <PrimaryButton
          label="Cancel"
          variant="ghost"
          onPress={() => setLogOpen(false)}
        />
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    gap: spacing.sm,
    marginBottom: spacing.lg,
    padding: spacing.xl,
  },
  panelTitle: {
    color: colors.nearBlack,
    fontSize: 16,
    fontWeight: "600",
  },
  kicker: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "600",
  },
  weightValue: {
    color: colors.nearBlack,
    fontSize: 36,
    fontWeight: "700",
  },
  changeNeutral: {
    color: colors.darkGrey,
    fontSize: 15,
  },
  sparkWrap: {
    alignItems: "center",
    marginVertical: spacing.sm,
  },
  sparkEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  tip: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
  },
  measureRow: {
    alignItems: "center",
    borderBottomColor: colors.lightGrey,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: touchTargetMin,
    paddingVertical: spacing.sm,
  },
  rowTitle: {
    color: colors.nearBlack,
    fontSize: 15,
    fontWeight: "500",
  },
  rowMeta: {
    color: colors.midGrey,
    fontSize: 14,
  },
  photosHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  compareBtn: {
    minHeight: touchTargetMin,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  compareLabel: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
  photoGroup: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  photoDate: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "600",
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  photoTile: {
    borderRadius: radii.card,
    overflow: "hidden",
  },
  photoTileSelected: {
    borderColor: colors.indigo,
    borderWidth: 2,
  },
  photoPlaceholder: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    height: 88,
    justifyContent: "center",
    width: 88,
  },
  photoPlaceholderText: {
    color: colors.indigo,
    fontSize: 12,
    fontWeight: "600",
  },
  stepperRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "center",
    marginVertical: spacing.md,
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
    fontSize: 24,
    fontWeight: "600",
  },
  stepperValue: {
    color: colors.nearBlack,
    fontSize: 28,
    fontWeight: "700",
    minWidth: 120,
    textAlign: "center",
  },
  confirmOdd: {
    color: colors.darkGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  muted: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  offline: {
    color: colors.midGrey,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
});
