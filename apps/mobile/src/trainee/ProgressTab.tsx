import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";
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
  CheckCircle2,
  ChevronRight,
  MessageCircle,
  Plus,
  Ruler,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError, userFacingMessage } from "@fitbud/api-client";
import type {
  Checkin,
  CoachingRelationship,
  Measurement,
  MeasurementType,
  ProgressSummary,
} from "@fitbud/contracts";
import { formatCivilDate, formatClockTime } from "@fitbud/core";
import { spacing, touchTargetMin } from "@fitbud/ui-mobile";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../providers/ThemeProvider";
import { useAuth } from "../auth/AuthProvider";
import { BottomSheet } from "../components/BottomSheet";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { createIdempotencyKey } from "../lib/idempotency";
import { localDateInTimezone } from "../lib/dates";
import type { TraineeOverlayOpener } from "../navigation/TraineeOverlay";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";
import { outcomeCopy, } from "./CheckinScreen";
import { cleanMeasureInput } from "./checkin/MeasureRow";
import { reportError } from "../lib/reportError";
import { isNetworkFailure } from "./checkinAnswers";
import {
  getCached,
  messageFromSyncResults,
  setCached,
  subscribe,
} from "./dataCache";
import { CoachLogBadge } from "./coach-log/CoachLogBadge";
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

/**
 * One point per civil day: the last reading of the day wins. Two weigh-ins on
 * one day would otherwise draw two dots on one date and collide as React keys.
 */
export function weightSeriesLast12Weeks(
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
    .reduce<Array<{ date: string; value: number }>>((days, m) => {
      const date = civilFromObservedAt(m.observedAt, timeZone);
      const last = days[days.length - 1];
      if (last && last.date === date) last.value = m.value;
      else days.push({ date, value: m.value });
      return days;
    }, []);
}

/** Minimum distance in px between two month labels on the x-axis. */
const MONTH_TICK_MIN_GAP = 36;

/** The first point of each distinct month, in order. */
export function monthTickPoints<T extends { date: string }>(points: T[]): T[] {
  const seen = new Set<string>();
  const ticks: T[] = [];
  for (const p of points) {
    const month = p.date.slice(0, 7);
    if (seen.has(month)) continue;
    seen.add(month);
    ticks.push(p);
  }
  return ticks;
}

/**
 * Left edge of the start-marker pill: centred on the marker, then clamped so
 * the pill stays inside [0, chartWidth - pillWidth]. Before the pill has been
 * measured (pillWidth 0) it is only kept off the left edge.
 */
/** Anchor for month labels so the first/last are not clipped at the chart edge. */
export function monthTickTextAnchor(
  index: number,
  count: number,
): "start" | "middle" | "end" {
  if (index === 0) return "start";
  if (index === count - 1) return "end";
  return "middle";
}

export function clampMarkerLeft(
  markerX: number,
  pillWidth: number,
  chartWidth: number,
): number {
  const centred = markerX - pillWidth / 2;
  const max = Math.max(0, chartWidth - pillWidth);
  return Math.min(Math.max(0, centred), max);
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
  const theme = useTheme();
  const styles = useStyles();
  const [pillWidth, setPillWidth] = useState(0);
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
  // A start date before the 12-week window pins the marker to the first
  // point; the pill then sits on the left edge with the same copy.
  const startIndex = points.findIndex((p) => p.date >= startCivil);
  const markerIndex = startIndex >= 0 ? startIndex : 0;
  const marker = points[markerIndex]!;

  const yTicks = [max, (max + min) / 2, min].map((v) => ({
    value: v,
    y: chartBottom - ((v - min) / range) * (chartBottom - chartTop),
  }));

  // One tick per month, and a tick that would sit on top of the previous label
  // is left out rather than overprinted.
  const monthTicks = monthTickPoints(points).reduce<typeof points>(
    (kept, p) => {
      const last = kept[kept.length - 1];
      if (!last || p.x - last.x >= MONTH_TICK_MIN_GAP) kept.push(p);
      return kept;
    },
    [],
  );

  const markerLeft = clampMarkerLeft(marker.x, pillWidth, width);

  return (
    <View style={styles.chartWrap}>
      <View
        style={[styles.chartMarker, { left: markerLeft }]}
        onLayout={(e) => setPillWidth(e.nativeEvent.layout.width)}
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
            <Stop offset="0" stopColor={theme.colors.coachInk} stopOpacity={0.16} />
            <Stop offset="1" stopColor={theme.colors.coachInk} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {yTicks.map((tick, i) => (
          <Line
            key={`grid-${i}`}
            x1={padLeft}
            x2={width - padRight}
            y1={tick.y}
            y2={tick.y}
            stroke={theme.colors.fill2}
            strokeWidth={1}
          />
        ))}
        {yTicks.map((tick, i) => (
          <SvgText
            key={`lbl-${i}`}
            x={width - 4}
            y={tick.y + 4}
            fontSize={11}
            fill={theme.colors.ink3}
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
          stroke={theme.colors.coach}
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
        <Polyline
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={theme.colors.coachInk}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <Circle
            key={`pt-${i}-${p.date}`}
            cx={p.x}
            cy={p.y}
            r={i === points.length - 1 ? 5 : 3}
            fill={i === points.length - 1 ? theme.colors.coachInk : theme.colors.card}
            stroke={theme.colors.coachInk}
            strokeWidth={i === points.length - 1 ? 2.5 : 1.5}
            opacity={i === points.length - 1 ? 1 : 0.55}
          />
        ))}
        {monthTicks.map((p, i) => (
          <SvgText
            key={`m-${i}-${p.date}`}
            x={p.x}
            y={height - 6}
            fontSize={11}
            fill={theme.colors.ink3}
            fontWeight="500"
            textAnchor={monthTickTextAnchor(i, monthTicks.length)}
          >
            {monthLabel(p.date)}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

export function ProgressTab(props: ComponentProps<typeof ProgressTabInner>) {
  return (
    <ThemeScope scheme="system">
      <ProgressTabInner {...props} />
    </ThemeScope>
  );
}

function ProgressTabInner({
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
  const theme = useTheme();
  const styles = useStyles();
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
  /** What the trainee has typed on the keypad (TR-13c). */
  const [logText, setLogText] = useState("");
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
        reportError("ProgressTab.load", err);
        // Offline is only claimed for a request that never got an answer.
        setOffline(err instanceof ApiClientError ? false : isNetworkFailure(err));
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
              userFacingMessage(err, {
                fallback: "Couldn't load your progress. Try again.",
              }),
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
    } catch (err) {
      reportError("ProgressTab.loadCheckins", err);
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
      // Adopt what another writer stored. `load` itself calls `setCached`,
      // and `setCached` notifies this key, so calling `load` here made every
      // successful fetch start the next one (the loop CU24 removed on the
      // workout tab; BT15, D-W4-16).
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
    setLogText(String(Math.round(fallback * 10) / 10));
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
      reportError("ProgressTab.saveMeasurement", err);
      if (err instanceof ApiClientError) {
        setError(userFacingMessage(err));
      } else if (isNetworkFailure(err)) {
        setOffline(true);
        setError("Saved on phone · will sync when online.");
      } else {
        setError("Couldn't save that. Try again.");
      }
      setLogOpen(false);
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

  const logUnit = logType === "body_weight_kg" ? "kg" : "cm";
  const lastLogged = (() => {
    const last = latestOfType(measurements, logType);
    return last
      ? {
          value: last.value,
          when: formatCivilDate(civilFromObservedAt(last.observedAt, timeZone), {
            includeWeekday: true,
          }),
        }
      : null;
  })();
  // The entry is stamped now (observedAt), so the date row is read-only.
  const logWhen = `Today, ${formatClockTime(new Date().toISOString(), timeZone)}`;
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
      v3
      chrome="app"
      title="Progress"
      showHeader={false}
      refreshing={refreshing}
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
            <Bell size={22} color={theme.colors.ink2} strokeWidth={1.75} />
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
              <Plus size={18} color={theme.colors.brandInk} strokeWidth={2} />
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
          <CoachLogBadge
            loggedByRole={latestWeight.loggedByRole}
            lastEditedByRole={latestWeight.lastEditedByRole}
            editedAt={latestWeight.updatedAt}
            timeZone={timeZone}
          />
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
              <Ruler size={19} color={theme.colors.coachInk} strokeWidth={1.75} />
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
                  <Ruler size={19} color={theme.colors.coachInk} strokeWidth={1.75} />
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
                  <CoachLogBadge
                    loggedByRole={latest!.loggedByRole}
                    lastEditedByRole={latest!.lastEditedByRole}
                    editedAt={latest!.updatedAt}
                    timeZone={timeZone}
                  />
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
            const subtitle = item.review
              ? item.review.notes
                ? `${outcomeCopy(item.review.outcome, coach)} · reviewed`
                : outcomeCopy(item.review.outcome, coach)
              : item.status === "submitted"
                ? `${coach} will review`
                : "";
            const tileStyle = item.review
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
                  {item.review ? (
                    <CheckCircle2
                      size={19}
                      color={theme.colors.done}
                      strokeWidth={1.75}
                    />
                  ) : (
                    <MessageCircle
                      size={19}
                      color={theme.colors.info}
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
                <ChevronRight size={18} color={theme.colors.ink3} strokeWidth={2} />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={styles.muted}>Check-ins appear here after you submit.</Text>
      )}

      <BottomSheet
        visible={logOpen}
        title={logTitle}
        onDismiss={() => setLogOpen(false)}
      >
        <View style={styles.keypadValue}>
          <TextInput
            value={logText}
            onChangeText={(next) => {
              setLogText(cleanMeasureInput(next));
              setConfirmOdd(null);
            }}
            keyboardType="decimal-pad"
            inputMode="decimal"
            autoFocus
            selectTextOnFocus
            maxLength={6}
            accessibilityLabel={`${logTitle}, ${logUnit}`}
            placeholder="0"
            placeholderTextColor={theme.colors.ink4}
            style={styles.keypadInput}
          />
          <Text variant="headline" tone="ink3">
            {logUnit}
          </Text>
        </View>
        {lastLogged ? (
          <Text variant="subhead" tone="ink3" style={styles.keypadLast}>
            {`Last: ${formatKg(lastLogged.value)} ${logUnit} on ${lastLogged.when}`}
          </Text>
        ) : null}
        <View style={styles.dateRow} accessible accessibilityLabel={`Date, ${logWhen}`}>
          <Text variant="body">Date</Text>
          <Text variant="body" tone="ink3">
            {logWhen}
          </Text>
        </View>
        {confirmOdd != null ? (
          <Text style={styles.confirmOdd}>
            {formatKg(confirmOdd)} kg looks unusual. Tap Save again to confirm.
          </Text>
        ) : null}
        <PrimaryButton
          label={
            acting
              ? "Saving…"
              : logType === "body_weight_kg"
                ? "Save weight"
                : "Save"
          }
          disabled={acting || !(parseFloat(logText) > 0)}
          onPress={() => {
            void saveMeasurement(parseFloat(logText));
          }}
        />
        <PrimaryButton
          label="Cancel"
          variant="text"
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

const useStyles = createThemedStyles((t) => ({
  ttlrow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  h1: {
    color: t.colors.ink,
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
    backgroundColor: t.colors.coachInk,
    borderRadius: 5,
    height: 9,
    position: "absolute",
    right: 11,
    top: 10,
    width: 9,
  },
  cardPad: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: t.radii.card,
    borderWidth: 1,
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.lg,
    ...cardShadow,
  },
  listCard: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: t.radii.card,
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
    color: t.colors.ink,
    fontSize: 17,
    fontWeight: "700",
  },
  shLink: {
    color: t.colors.coachInk,
    fontSize: 15,
    fontWeight: "600",
  },
  ov: {
    color: t.colors.ink3,
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
    color: t.colors.ink,
    fontSize: 40,
    fontWeight: "700",
    letterSpacing: -1.2,
    lineHeight: 44,
  },
  weightUnit: {
    color: t.colors.ink3,
    fontSize: 18,
    fontWeight: "600",
  },
  logWeightBtn: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 14,
    flexDirection: "row",
    gap: 6,
    height: 44,
    justifyContent: "center",
    marginTop: 2,
    paddingHorizontal: spacing.md,
  },
  logWeightLabel: {
    color: t.colors.brandInk,
    fontSize: 15,
    fontWeight: "600",
  },
  chg: {
    color: t.colors.ink2,
    fontSize: 15,
    lineHeight: 21,
  },
  chgBold: {
    color: t.colors.ink,
    fontWeight: "700",
  },
  chgMuted: {
    color: t.colors.ink3,
  },
  chartWrap: {
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
    position: "relative",
  },
  chartMarker: {
    backgroundColor: t.colors.brandTint,
    borderRadius: 11,
    height: 22,
    justifyContent: "center",
    paddingHorizontal: 8,
    position: "absolute",
    top: -24,
    zIndex: 1,
  },
  chartMarkerText: {
    color: t.colors.coachInk,
    fontSize: 11,
    fontWeight: "700",
  },
  chartEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  tip: {
    color: t.colors.ink3,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  lrowFirst: {
    borderTopWidth: 0,
  },
  lrow: {
    alignItems: "center",
    borderTopColor: t.colors.line,
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
    backgroundColor: t.colors.brandTint,
    borderRadius: 11,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  tilePos: {
    backgroundColor: t.colors.doneTint,
  },
  tileInfo: {
    backgroundColor: t.colors.infoTint,
  },
  rowTitle: {
    color: t.colors.ink,
    fontSize: 16,
    fontWeight: "600",
  },
  rowMeta: {
    color: t.colors.ink3,
    fontSize: 14,
    lineHeight: 19,
  },
  logLink: {
    color: t.colors.coachInk,
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
    backgroundColor: t.colors.brandTint2,
    borderRadius: 18,
    flex: 1,
    height: 128,
    justifyContent: "flex-end",
    overflow: "hidden",
    paddingBottom: 10,
  },
  phLabel: {
    color: t.colors.ink,
    fontSize: 14,
    fontWeight: "600",
  },
  phEmpty: {
    alignItems: "center",
    borderColor: t.colors.line2,
    borderRadius: 18,
    borderStyle: "dashed",
    borderWidth: 1.5,
    flex: 1,
    gap: 6,
    height: 128,
    justifyContent: "center",
  },
  phEmptyTitle: {
    color: t.colors.coachInk,
    fontSize: 14,
    fontWeight: "600",
  },
  emptyTitle: {
    color: t.colors.ink,
    fontSize: 16,
    fontWeight: "600",
  },
  keypadValue: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    marginTop: spacing.md,
  },
  keypadInput: {
    color: t.colors.ink,
    fontSize: 56,
    fontWeight: "700",
    minWidth: 120,
    padding: 0,
    textAlign: "center",
    ...({ fontVariant: ["tabular-nums"] } as object),
  },
  keypadLast: { marginBottom: spacing.md, textAlign: "center" },
  dateRow: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: t.radii.group,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.md,
    minHeight: touchTargetMin,
    paddingHorizontal: spacing.lg,
  },
  confirmOdd: {
    color: t.colors.ink2,
    fontSize: 14,
    lineHeight: 20,
  },
  muted: {
    color: t.colors.ink3,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  offline: {
    color: t.colors.ink3,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
}));
