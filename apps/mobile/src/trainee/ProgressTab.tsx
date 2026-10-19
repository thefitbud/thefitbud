import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Polyline,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import {
  Bell,
  Camera,
  CheckCircle2,
  ChevronRight,
  MessageCircle,
  PersonStanding,
  Plus,
  Ruler,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type {
  Checkin,
  CoachingRelationship,
  Measurement,
  MeasurementType,
  MediaAsset,
  ProgressSummary,
} from "@fitbud/contracts";
import { formatCivilDate } from "@fitbud/core";
import { colors, radii, semanticColors, spacing, touchTargetMin } from "@fitbud/ui-mobile";
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
import type { TraineeOverlayOpener } from "../navigation/TraineeOverlay";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";
import { outcomeCopy } from "./CheckinScreen";
import {
  getCached,
  messageFromSyncResults,
  setCached,
  subscribe,
} from "./dataCache";
import { coachInitials } from "./workoutDisplay";

const BODY_TYPES: MeasurementType[] = [
  "body_weight_kg",
  "waist_cm",
  "hip_cm",
  "chest_cm",
];

const PROGRESS_CACHE_PREFIX = "progress";
const CHECKINS_CACHE_PREFIX = "progress-checkins";

function progressCacheKey(relationshipId: string): string {
  return `${PROGRESS_CACHE_PREFIX}:${relationshipId}`;
}

function checkinsCacheKey(relationshipId: string): string {
  return `${CHECKINS_CACHE_PREFIX}:${relationshipId}`;
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

function formatDeltaCm(delta: number): string {
  const abs = formatKg(Math.abs(delta));
  if (delta > 0) return `+${abs} cm`;
  if (delta < 0) return `−${abs} cm`;
  return "0 cm";
}

function coachFirstName(relationship: CoachingRelationship): string {
  const raw = relationship.trainerDisplayName?.trim();
  if (!raw) return "your coach";
  return raw.split(/\s+/)[0] ?? raw;
}

function weeksBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(1, Math.round(Math.abs(end - start) / (7 * 86_400_000)));
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

function earliestOfType(
  measurements: Measurement[],
  type: MeasurementType,
): Measurement | null {
  const rows = measurements
    .filter((m) => m.type === type)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
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

function monthLabel(civilDate: string): string {
  const d = new Date(`${civilDate}T12:00:00`);
  return new Intl.DateTimeFormat("en-IN", { month: "short" }).format(d);
}

function WeightTrendChart({
  series,
  coachName,
  startedAt,
  timeZone,
}: {
  series: Array<{ date: string; value: number }>;
  coachName: string;
  startedAt: string;
  timeZone: string;
}) {
  const width = 329;
  const height = 150;
  const padLeft = 8;
  const padRight = 32;
  const chartBottom = 126;
  const chartTop = 12;

  if (series.length < 2) {
    return (
      <View style={[styles.chartEmpty, { height }]}>
        <Text style={styles.muted}>Log another weigh-in to see a trend.</Text>
      </View>
    );
  }

  const values = series.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const plotWidth = width - padLeft - padRight;

  const points = series.map((p, i) => {
    const x = padLeft + (i / (series.length - 1)) * plotWidth;
    const y =
      chartBottom -
      ((p.value - min) / range) * (chartBottom - chartTop);
    return { x, y, ...p };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${points[points.length - 1]!.x.toFixed(1)},${chartBottom} L${points[0]!.x.toFixed(1)},${chartBottom} Z`;

  const startCivil = civilFromObservedAt(startedAt, timeZone);
  const startIndex = points.findIndex((p) => p.date >= startCivil);
  const markerIndex = startIndex >= 0 ? startIndex : 0;
  const marker = points[markerIndex]!;

  const yTicks = [max, (max + min) / 2, min].map((v) => ({
    value: v,
    y: chartBottom - ((v - min) / range) * (chartBottom - chartTop),
  }));

  const monthTicks = [
    points[0],
    points[Math.floor(points.length / 2)],
    points[points.length - 1],
  ].filter((p): p is (typeof points)[number] => p != null);

  const markerLeftPct = (marker.x / width) * 100;

  return (
    <View style={styles.chartWrap}>
      <View
        style={[styles.chartMarker, { left: `${markerLeftPct}%` }]}
        accessibilityLabel={`Started with ${coachName}`}
      >
        <Text style={styles.chartMarkerText}>
          Started with {coachName} ·{" "}
          {formatCivilDate(startCivil, { includeWeekday: true })}
        </Text>
      </View>
      <Svg width={width} height={height} accessibilityLabel="Weight trend">
        <Defs>
          <LinearGradient id="weightArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.indigo} stopOpacity={0.16} />
            <Stop offset="1" stopColor={colors.indigo} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {yTicks.map((tick) => (
          <Line
            key={tick.value}
            x1={padLeft}
            x2={width - padRight}
            y1={tick.y}
            y2={tick.y}
            stroke="#ECEDF3"
            strokeWidth={1}
          />
        ))}
        {yTicks.map((tick) => (
          <SvgText
            key={`lbl-${tick.value}`}
            x={width - 4}
            y={tick.y + 4}
            fontSize={11}
            fill={colors.midGrey}
            fontWeight="500"
            textAnchor="end"
          >
            {Math.round(tick.value)}
          </SvgText>
        ))}
        <Path d={areaPath} fill="url(#weightArea)" />
        <Line
          x1={marker.x}
          x2={marker.x}
          y1={chartTop - 4}
          y2={chartBottom}
          stroke="#B7A9F5"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
        <Polyline
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={colors.indigo}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <Circle
            key={p.date}
            cx={p.x}
            cy={p.y}
            r={i === points.length - 1 ? 5 : 3}
            fill={i === points.length - 1 ? colors.indigo : colors.white}
            stroke={colors.indigo}
            strokeWidth={i === points.length - 1 ? 2.5 : 1.5}
            opacity={i === points.length - 1 ? 1 : 0.55}
          />
        ))}
        {monthTicks.map((p) => (
          <SvgText
            key={`m-${p.date}`}
            x={p.x}
            y={height - 6}
            fontSize={11}
            fill={colors.midGrey}
            fontWeight="500"
            textAnchor="middle"
          >
            {monthLabel(p.date)}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

export function ProgressTab({
  relationship,
  unreadNotifications = 0,
  onOpenOverlay,
  onOpenCheckin,
}: {
  relationship: CoachingRelationship;
  unreadNotifications?: number;
  onOpenOverlay?: TraineeOverlayOpener;
  onOpenCheckin?: (checkin: Checkin) => void;
}) {
  const { api, me, refreshSession } = useAuth();
  const timeZone = me?.timezone ?? "UTC";
  const sync = useSyncEngine();
  const cacheKey = progressCacheKey(relationship.id);
  const checkinsKey = checkinsCacheKey(relationship.id);
  const coach = coachFirstName(relationship);

  const [summary, setSummary] = useState<ProgressSummary | null>(
    () => getCached<ProgressSummary>(cacheKey) ?? null,
  );
  const [checkins, setCheckins] = useState<Checkin[]>(
    () => getCached<Checkin[]>(checkinsKey) ?? [],
  );
  const [loading, setLoading] = useState(!summary);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logType, setLogType] = useState<MeasurementType>("body_weight_kg");
  const [stepValue, setStepValue] = useState(70);
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

  const loadCheckins = useCallback(async () => {
    try {
      const listed = await api.listCheckins(relationship.id);
      const rows = listed.items
        .filter((c) => c.status === "submitted" || c.status === "reviewed")
        .sort((a, b) => b.localDate.localeCompare(a.localDate))
        .slice(0, 5);
      setCheckins(rows);
      setCached(checkinsKey, rows);
    } catch {
      const cached = getCached<Checkin[]>(checkinsKey);
      if (cached) setCheckins(cached);
    }
  }, [api, checkinsKey, relationship.id]);

  useEffect(() => {
    void load();
    void loadCheckins();
  }, [load, loadCheckins]);

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
      { includeWeekday: true },
    );
    const weeks = weeksBetween(firstWeight.observedAt, latestWeight.observedAt);
    return {
      deltaText: formatDeltaKg(delta),
      since,
      weeks,
    };
  }, [firstWeight, latestWeight, timeZone]);

  const lastWeighInTip = useMemo(() => {
    if (!latestWeight) return null;
    const when = formatCivilDate(
      civilFromObservedAt(latestWeight.observedAt, timeZone),
      { includeWeekday: true },
    );
    return `Last weigh-in ${when}. Weigh in at the same time each week for a clearer trend.`;
  }, [latestWeight, timeZone]);

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
    if (
      logType === "body_weight_kg" &&
      (value < 30 || value > 250) &&
      confirmOdd !== value
    ) {
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

  const bodyMeasurements = BODY_TYPES.filter((t) => t !== "body_weight_kg")
    .map((type) => ({
      type,
      latest: latestOfType(measurements, type),
      first: earliestOfType(measurements, type),
    }))
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

  const measurementLabel = (type: MeasurementType) =>
    type === "waist_cm"
      ? "Waist"
      : type === "hip_cm"
        ? "Hip"
        : type === "chest_cm"
          ? "Chest"
          : "Measurement";

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
        void loadCheckins();
      }}
    >
      <View style={styles.ttlrow}>
        <Text style={styles.h1} accessibilityRole="header">
          Progress
        </Text>
        {onOpenOverlay ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            onPress={() => onOpenOverlay({ screen: "notifications" })}
            style={styles.iconbtn}
          >
            <Bell size={22} color={colors.darkGrey} strokeWidth={1.75} />
            {unreadNotifications > 0 ? <View style={styles.unreadDot} /> : null}
          </Pressable>
        ) : null}
      </View>

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
        <View style={styles.cardPad}>
          <Text style={styles.emptyTitle} accessibilityRole="header">
            Your progress will show here. Start with your weight today.
          </Text>
          <PrimaryButton label="Log weight" onPress={() => openLog("body_weight_kg")} />
        </View>
      ) : null}

      {!empty && latestWeight ? (
        <View style={styles.cardPad}>
          <View style={styles.weightTop}>
            <View>
              <Text style={styles.ov}>Weight</Text>
              <Text style={styles.weightBig}>
                {formatKg(latestWeight.value)}
                <Text style={styles.weightUnit}>kg</Text>
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log weight"
              onPress={() => openLog("body_weight_kg")}
              style={styles.logWeightBtn}
            >
              <Plus size={18} color={colors.white} strokeWidth={2} />
              <Text style={styles.logWeightLabel}>Log weight</Text>
            </Pressable>
          </View>
          {changeCopy ? (
            <Text style={styles.chg}>
              <Text style={styles.chgBold}>{changeCopy.deltaText}</Text>
              {" since "}
              {changeCopy.since}
              <Text style={styles.chgMuted}> · {changeCopy.weeks} weeks</Text>
            </Text>
          ) : (
            <Text style={styles.muted}>First weigh-in logged</Text>
          )}
          <WeightTrendChart
            series={series}
            coachName={coach}
            startedAt={relationship.startedAt}
            timeZone={timeZone}
          />
          {lastWeighInTip ? <Text style={styles.tip}>{lastWeighInTip}</Text> : null}
        </View>
      ) : null}

      {!empty && !latestWeight ? (
        <View style={styles.cardPad}>
          <Text style={styles.ov}>Weight</Text>
          <PrimaryButton label="Log weight" onPress={() => openLog("body_weight_kg")} />
        </View>
      ) : null}

      <View style={styles.sh}>
        <Text style={styles.shTitle}>Measurements</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => openLog("waist_cm")}
        >
          <Text style={styles.shLink}>Add other</Text>
        </Pressable>
      </View>
      <View style={styles.listCard}>
        {bodyMeasurements.length === 0 ? (
          <View style={styles.lrow}>
            <View style={styles.tile}>
              <Ruler size={19} color={colors.indigo} strokeWidth={1.75} />
            </View>
            <View style={styles.lrowText}>
              <Text style={styles.rowTitle}>Waist</Text>
              <Text style={styles.rowMeta}>Log waist to track shape</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => openLog("waist_cm")}
            >
              <Text style={styles.logLink}>Log</Text>
            </Pressable>
          </View>
        ) : (
          bodyMeasurements.map(({ type, latest, first }, index) => {
            const delta =
              latest && first && latest.id !== first.id
                ? latest.value - first.value
                : null;
            const since =
              first && delta != null
                ? formatCivilDate(
                    civilFromObservedAt(first.observedAt, timeZone),
                    { includeWeekday: true },
                  )
                : null;
            return (
              <View
                key={type}
                style={[styles.lrow, index === 0 && styles.lrowFirst]}
              >
                <View style={styles.tile}>
                  <Ruler size={19} color={colors.indigo} strokeWidth={1.75} />
                </View>
                <View style={styles.lrowText}>
                  <Text style={styles.rowTitle}>
                    {measurementLabel(type)} · {formatKg(latest!.value)} cm
                  </Text>
                  {delta != null && since ? (
                    <Text style={styles.rowMeta}>
                      {formatDeltaCm(delta)} since {since}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Log ${measurementLabel(type)}`}
                  onPress={() => openLog(type)}
                >
                  <Text style={styles.logLink}>Log</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.sh}>
        <Text style={styles.shTitle}>Check-ins</Text>
        {checkins.length > 0 && onOpenCheckin ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenCheckin(checkins[0]!)}
          >
            <Text style={styles.shLink}>See all</Text>
          </Pressable>
        ) : null}
      </View>
      {checkins.length > 0 ? (
        <View style={styles.listCard}>
          {checkins.slice(0, 3).map((item, index) => {
            const weight = item.answers?.bodyWeightKg;
            const title = `${formatCivilDate(item.localDate, {
              includeWeekday: true,
            })}${weight != null ? ` · ${formatKg(weight)} kg` : ""}`;
            const subtitle =
              item.status === "reviewed" && item.review
                ? item.review.notes
                  ? `${outcomeCopy(item.review.outcome, coach)} · reviewed`
                  : outcomeCopy(item.review.outcome, coach)
                : item.status === "submitted"
                  ? `${coach} will review`
                  : "";
            const tileStyle =
              item.status === "reviewed"
                ? styles.tilePos
                : styles.tileInfo;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                style={[styles.lrow, index === 0 && styles.lrowFirst]}
                onPress={() => onOpenCheckin?.(item)}
              >
                <View style={[styles.tile, tileStyle]}>
                  {item.status === "reviewed" ? (
                    <CheckCircle2
                      size={19}
                      color={semanticColors.positive.text}
                      strokeWidth={1.75}
                    />
                  ) : (
                    <MessageCircle
                      size={19}
                      color={semanticColors.info.text}
                      strokeWidth={1.75}
                    />
                  )}
                </View>
                <View style={styles.lrowText}>
                  <Text style={styles.rowTitle}>{title}</Text>
                  {subtitle ? (
                    <Text style={styles.rowMeta}>{subtitle}</Text>
                  ) : null}
                </View>
                <ChevronRight size={18} color={colors.midGrey} strokeWidth={2} />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={styles.muted}>Check-ins appear here after you submit.</Text>
      )}

      {photosByDate.length > 0 ? (
        <>
          <View style={styles.sh}>
            <Text style={styles.shTitle}>Photos</Text>
            {media.length >= 2 ? (
              <Pressable accessibilityRole="button">
                <Text style={styles.shLink}>Compare</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.ph3}>
            {photosByDate.slice(0, 2).map(([day]) => (
              <View key={day} style={styles.phDone}>
                <PersonStanding
                  size={64}
                  color="rgba(26, 18, 72, 0.28)"
                  strokeWidth={1.75}
                />
                <Text style={styles.phLabel}>
                  {formatCivilDate(day, { includeWeekday: true })}
                </Text>
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add photos"
              style={styles.phEmpty}
              disabled={acting}
              onPress={() => {
                void addProgressPhoto();
              }}
            >
              <Camera size={24} color={colors.indigo} strokeWidth={1.75} />
              <Text style={styles.phEmptyTitle}>Add photos</Text>
            </Pressable>
          </View>
        </>
      ) : null}

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

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#1A1248",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  default: { elevation: 1 },
});

const styles = StyleSheet.create({
  ttlrow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  h1: {
    color: colors.deepNavy,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.66,
    lineHeight: 36,
  },
  iconbtn: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    position: "relative",
    width: 44,
  },
  unreadDot: {
    backgroundColor: colors.indigo,
    borderRadius: 5,
    height: 9,
    position: "absolute",
    right: 11,
    top: 10,
    width: 9,
  },
  cardPad: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.lg,
    ...cardShadow,
  },
  listCard: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: radii.card,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: "hidden",
    ...cardShadow,
  },
  sh: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  shTitle: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
  },
  shLink: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
  ov: {
    color: colors.midGrey,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  weightTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  weightBig: {
    color: colors.deepNavy,
    fontSize: 40,
    fontWeight: "700",
    letterSpacing: -1.2,
    lineHeight: 44,
  },
  weightUnit: {
    color: colors.midGrey,
    fontSize: 18,
    fontWeight: "600",
  },
  logWeightBtn: {
    alignItems: "center",
    backgroundColor: colors.indigo,
    borderRadius: 14,
    flexDirection: "row",
    gap: 6,
    height: 44,
    justifyContent: "center",
    marginTop: 2,
    paddingHorizontal: spacing.md,
  },
  logWeightLabel: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "600",
  },
  chg: {
    color: colors.darkGrey,
    fontSize: 15,
    lineHeight: 21,
  },
  chgBold: {
    color: colors.deepNavy,
    fontWeight: "700",
  },
  chgMuted: {
    color: colors.midGrey,
  },
  chartWrap: {
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
    position: "relative",
  },
  chartMarker: {
    backgroundColor: colors.paleLavender,
    borderRadius: 11,
    height: 22,
    justifyContent: "center",
    paddingHorizontal: 8,
    position: "absolute",
    top: -24,
    transform: [{ translateX: -80 }],
    zIndex: 1,
  },
  chartMarkerText: {
    color: colors.indigo,
    fontSize: 11,
    fontWeight: "700",
  },
  chartEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  tip: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  lrowFirst: {
    borderTopWidth: 0,
  },
  lrow: {
    alignItems: "center",
    borderTopColor: "#E7E9F2",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  lrowText: {
    flex: 1,
    minWidth: 0,
  },
  tile: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderRadius: 11,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  tilePos: {
    backgroundColor: semanticColors.positive.fill,
  },
  tileInfo: {
    backgroundColor: semanticColors.info.fill,
  },
  rowTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
  rowMeta: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 19,
  },
  logLink: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
    minHeight: touchTargetMin,
    lineHeight: touchTargetMin,
    textAlign: "center",
  },
  ph3: {
    flexDirection: "row",
    gap: 10,
    marginBottom: spacing.lg,
  },
  phDone: {
    alignItems: "center",
    backgroundColor: "#D9D3F7",
    borderRadius: 18,
    flex: 1,
    height: 128,
    justifyContent: "flex-end",
    overflow: "hidden",
    paddingBottom: 10,
  },
  phLabel: {
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "600",
  },
  phEmpty: {
    alignItems: "center",
    borderColor: "#D5D6DE",
    borderRadius: 18,
    borderStyle: "dashed",
    borderWidth: 1.5,
    flex: 1,
    gap: 6,
    height: 128,
    justifyContent: "center",
  },
  phEmptyTitle: {
    color: colors.indigo,
    fontSize: 14,
    fontWeight: "600",
  },
  emptyTitle: {
    color: colors.deepNavy,
    fontSize: 16,
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
    marginBottom: spacing.md,
  },
  offline: {
    color: colors.midGrey,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
});
