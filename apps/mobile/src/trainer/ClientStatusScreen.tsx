import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type {
  ClientWorkspace,
  MealAssignment,
  TrainerNote,
  WorkoutAssignment,
} from "@fitbud/contracts";
import {
  formatCivilDate,
  formatClockTime,
  formatPersonName,
  formatRelative,
  labelFor,
} from "@fitbud/core";
import { colors, fontFamilyMedium, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { StatusChip } from "../components/StatusChip";
import { Snackbar } from "../components/Snackbar";
import { initialsFromName, WhatsAppGlyph } from "../components/m2";
import { createIdempotencyKey } from "../lib/idempotency";
import { addDays, localDateInTimezone, startOfWeekMonday, weekDatesFrom, weekdayShort } from "../lib/dates";
import { isMealLoggedForCount, loggedMacrosForMeal } from "../trainee/nutrition";
import { readTrainerCache, writeTrainerCache } from "./cache";
import { openContextualWhatsApp } from "./whatsapp";

type Props = {
  relationshipId: string;
  displayName: string;
  onboardingStatusLabelText?: string;
  onBack: () => void;
  onOpenException: (exceptionId: string) => void;
  onOpenCheckin: (checkinId: string) => void;
};

type Snapshot = {
  workspace: ClientWorkspace;
  workouts: WorkoutAssignment[];
  meals: MealAssignment[];
  notes: TrainerNote[];
  savedAt: string;
};

function coachingWeek(startedAt: string | null | undefined): number | null {
  if (!startedAt) return null;
  const elapsed = Date.now() - Date.parse(startedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 1;
  return Math.max(1, Math.floor(elapsed / (7 * 24 * 60 * 60 * 1000)) + 1);
}

function isOfflineError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof ApiClientError) return err.status === 0;
  return err instanceof Error && /fetch|network|offline/i.test(err.message);
}

export function ClientStatusScreen({
  relationshipId,
  displayName,
  onBack,
  onOpenException,
  onOpenCheckin,
}: Props) {
  const { api, me } = useAuth();
  const zone = me?.timezone ?? "Asia/Kolkata";
  const today = localDateInTimezone(zone);
  const weekStart = startOfWeekMonday(today);
  const weekEnd = addDays(weekStart, 6);
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineAt, setOfflineAt] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteVisible, setNoteVisible] = useState(false);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [workspace, workoutPage, mealPage, notePage] = await Promise.all([
        api.getClientWorkspace(relationshipId),
        api.listWorkoutAssignments(relationshipId, {
          fromDate: weekStart,
          toDate: weekEnd,
        }),
        api.listMealAssignments(relationshipId, {
          fromDate: weekStart,
          toDate: weekEnd,
        }),
        api.listTrainerNotes(relationshipId),
      ]);
      const snapshot: Snapshot = {
        workspace,
        workouts: workoutPage.items,
        meals: mealPage.items,
        notes: notePage.items,
        savedAt: new Date().toISOString(),
      };
      setData(snapshot);
      writeTrainerCache(`trainer:client:${relationshipId}`, snapshot);
      setOfflineAt(null);
    } catch (err) {
      const cached = readTrainerCache<Snapshot>(`trainer:client:${relationshipId}`);
      if (isOfflineError(err) && cached) {
        setData(cached);
        setOfflineAt(cached.savedAt);
        setError(null);
      } else {
        setError("Couldn't load. Pull to try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [api, relationshipId, weekStart, weekEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  const header = data?.workspace.header;
  const name = formatPersonName(header?.traineeDisplayName || displayName);
  const first = name.split(" ")[0] || "there";
  const ended = header?.onboardingStatus === "ended" || Boolean(header?.endedAt);
  const offline = offlineAt != null;
  const open = data?.workspace.overview.openException ?? null;
  const planTitle = header?.effectivePlan?.title ?? null;
  const weekNumber = coachingWeek(header?.startedAt);
  const weekLabel = weekNumber != null ? `week ${weekNumber}` : null;
  const meta = [header?.goalShort, planTitle, weekLabel].filter(Boolean).join(" · ");

  const weekDates = useMemo(() => weekDatesFrom(weekStart), [weekStart]);
  const workoutsByDate = useMemo(() => {
    const map = new Map<string, WorkoutAssignment[]>();
    for (const item of data?.workouts ?? []) {
      const list = map.get(item.localDate) ?? [];
      list.push(item);
      map.set(item.localDate, list);
    }
    return map;
  }, [data?.workouts]);

  const weekWorkouts = data?.workouts ?? [];
  const doneWorkouts = weekWorkouts.filter(
    (item) => item.status === "completed" || item.status === "modified",
  ).length;
  const weekMeals = data?.meals ?? [];
  const loggedMeals = weekMeals.filter((item) => isMealLoggedForCount(item.status)).length;
  const todayMeals = weekMeals.filter((item) => item.localDate === today);
  const todayKcal = todayMeals.reduce((sum, meal) => {
    if (!isMealLoggedForCount(meal.status)) return sum;
    return sum + loggedMacrosForMeal(meal).kcal;
  }, 0);
  const assignedKcal = todayMeals.reduce((sum, meal) => {
    return sum + (loggedMacrosForMeal({ ...meal, status: "confirmed" }).kcal || 0);
  }, 0);

  const checkin =
    data?.workspace.overview.pendingReviewCheckin ??
    data?.workspace.overview.nextCheckin ??
    null;

  async function copyPlanLink() {
    const url = `https://fitbud.app/coach/client/${relationshipId}`;
    try {
      const clipboard = (
        globalThis as { navigator?: { clipboard?: { writeText: (v: string) => Promise<void> } } }
      ).navigator?.clipboard;
      await clipboard?.writeText(url);
      setToast("Link copied");
    } catch {
      setToast("Link copied");
    }
  }

  async function saveNote() {
    if (!noteBody.trim() || ended || offline) return;
    setActing(true);
    try {
      await api.createTrainerNote(
        relationshipId,
        {
          body: noteBody.trim(),
          visibility: noteVisible ? "client" : "private",
        },
        createIdempotencyKey(),
      );
      setNoteBody("");
      setNoteOpen(false);
      setToast("Note saved");
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't load. Pull to try again.");
    } finally {
      setActing(false);
    }
  }

  return (
    <Screen
      title=""
      showHeader={false}
      chrome="app"
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load().finally(() => setRefreshing(false));
      }}
    >
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
        <Text style={styles.backText}>‹ Clients</Text>
      </Pressable>
      {offline ? (
        <Text style={styles.offline}>
          You're offline. Showing the last update from {formatClockTime(offlineAt!, zone)}.
        </Text>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      {loading && !data ? (
        <View>
          <View style={styles.skeleton} />
          <View style={styles.skeleton} />
        </View>
      ) : null}
      {ended ? (
        <View style={styles.ended}>
          <Text style={styles.endedText}>
            Coaching ended{" "}
            {header?.endedAt ? formatCivilDate(header.endedAt.slice(0, 10)) : ""} · read-only
          </Text>
        </View>
      ) : null}
      <View style={styles.header}>
        <View style={styles.avatarLg}>
          <Text style={styles.avatarLgText}>{initialsFromName(name)}</Text>
        </View>
        <View style={styles.headerBody}>
          <Text style={styles.h1}>{name}</Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : <Text style={styles.meta}>No plan assigned yet</Text>}
          <View style={styles.chipRow}>
            <StatusChip kind="lifecycle" value={header?.onboardingStatus ?? "active"} />
            {header?.adherenceState === "needs_attention" ? (
              <StatusChip kind="adherence" value="needs_attention" />
            ) : null}
          </View>
        </View>
      </View>
      {header?.traineeTimezone && header.traineeTimezone !== zone ? (
        <Text style={styles.tz}>
          {first}'s time {formatClockTime(new Date().toISOString(), header.traineeTimezone)}
        </Text>
      ) : null}
      {ended ? null : (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={offline || !header?.clientWhatsappE164}
            onPress={() =>
              void openContextualWhatsApp({
                phoneE164: header?.clientWhatsappE164,
                draftText: `Hi ${first}, `,
              }).then(() => setToast("Opened WhatsApp"))
            }
            style={styles.secondary}
          >
            <WhatsAppGlyph size={18} />
            <Text style={styles.secondaryText}>WhatsApp</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={offline}
            onPress={() =>
              void openContextualWhatsApp({
                phoneE164: header?.clientWhatsappE164,
                draftText: `Hi ${first}, `,
              }).then(() => setToast("Opened WhatsApp"))
            }
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>Nudge…</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void copyPlanLink()} style={styles.iconBtn}>
            <Text style={styles.secondaryText}>Edit</Text>
          </Pressable>
        </View>
      )}
      {!header?.clientWhatsappE164 && !ended ? (
        <Text style={styles.hint}>No WhatsApp number on file</Text>
      ) : null}
      {open && !ended ? (
        <View style={styles.alert}>
          <View style={styles.cardTop}>
            <StatusChip kind="severity" value={open.severity} />
            <Text style={styles.since}>
              {formatRelative(open.detectedAt)}
            </Text>
          </View>
          <Text style={styles.issue}>{open.summary}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={offline}
            onPress={() => onOpenException(open.id)}
            style={styles.primary}
          >
            <Text style={styles.primaryText}>Review</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.sectionHead}>
        <Text style={styles.section}>This week</Text>
        <Text style={styles.sectionMeta}>
          {formatCivilDate(weekStart)} – {formatCivilDate(weekEnd)}
        </Text>
      </View>
      <View style={styles.week}>
        {weekDates.map((date) => {
          const day = workoutsByDate.get(date) ?? [];
          const done = day.filter(
            (item) => item.status === "completed" || item.status === "modified",
          ).length;
          return (
            <View key={date} style={styles.day}>
              <Text style={styles.dayLabel}>{weekdayShort(zone, date).slice(0, 1)}</Text>
              <Text style={styles.dayCount}>
                {day.length === 0 ? "–" : `${done}/${day.length}`}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={styles.tiles}>
        <Tile value={`${doneWorkouts} of ${weekWorkouts.length || 0}`} label="Workouts" />
        <Tile value={`${loggedMeals} of ${weekMeals.length || 0}`} label="Meals logged" />
        <Tile
          value={`${todayKcal.toLocaleString("en-IN")} of ${Math.max(assignedKcal, todayKcal).toLocaleString("en-IN")}`}
          label="kcal today"
        />
      </View>
      {checkin ? (
        <View style={styles.card}>
          <Text style={styles.section}>
            Check-in · {formatCivilDate(checkin.localDate)}
          </Text>
          <Text style={styles.meta}>
            {checkin.status === "submitted"
              ? "Waiting for your review"
              : labelFor("checkin_status", checkin.status)}
          </Text>
          {!ended ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenCheckin(checkin.id)}
              style={styles.tinted}
            >
              <Text style={styles.tintedText}>Open</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.section}>Recent activity</Text>
      {(data?.workspace.overview.recentActivity ?? []).map((item) => (
        <View key={item.id} style={styles.activity}>
          <Text style={styles.name}>{item.title}</Text>
          <Text style={styles.meta}>
            {formatCivilDate(item.localDate)} · {formatRelative(item.occurredAt)}
          </Text>
        </View>
      ))}
      <View style={styles.sectionHead}>
        <Text style={styles.section}>Coach notes</Text>
        {!ended ? (
          <Pressable accessibilityRole="button" onPress={() => setNoteOpen(true)}>
            <Text style={styles.link}>Add note</Text>
          </Pressable>
        ) : null}
      </View>
      {(data?.notes ?? []).map((note) => (
        <View key={note.id} style={styles.card}>
          <Text style={styles.issue}>{note.body}</Text>
          <Text style={styles.meta}>
            {labelFor("trainer_note_visibility", note.visibility)} ·{" "}
            {formatCivilDate(note.createdAt.slice(0, 10))}
          </Text>
        </View>
      ))}
      {noteOpen ? (
        <View style={styles.card}>
          <TextInput
            accessibilityLabel="Note"
            value={noteBody}
            onChangeText={setNoteBody}
            placeholder="Add a note"
            placeholderTextColor={colors.midGrey}
            multiline
            style={styles.input}
          />
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: noteVisible }}
            onPress={() => setNoteVisible((value) => !value)}
            style={styles.switchRow}
          >
            <Text style={styles.meta}>
              {noteVisible ? `Visible to ${first}` : "Only you see this note"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={acting || offline}
            onPress={() => void saveNote()}
            style={styles.primary}
          >
            <Text style={styles.primaryText}>Save note</Text>
          </Pressable>
        </View>
      ) : null}
      {toast ? <Snackbar message={toast} onDismiss={() => setToast(null)} /> : null}
    </Screen>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { minHeight: 44, justifyContent: "center" },
  backText: { color: colors.indigo, fontFamily: fontFamilySemiBold, fontSize: 16 },
  header: { flexDirection: "row", gap: 12, marginTop: 8 },
  headerBody: { flex: 1 },
  avatarLg: {
    alignItems: "center",
    backgroundColor: "#F8D7D7",
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  avatarLgText: { color: colors.deepNavy, fontFamily: fontFamilySemiBold, fontSize: 18 },
  h1: { color: colors.deepNavy, fontFamily: fontFamilySemiBold, fontSize: 28 },
  meta: { color: colors.midGrey, fontSize: 14, lineHeight: 20, marginTop: 2 },
  chipRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  actions: { flexDirection: "row", gap: 8, marginTop: 16 },
  secondary: {
    alignItems: "center",
    borderColor: "#E7E9F2",
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    height: 48,
    justifyContent: "center",
  },
  secondaryText: { color: colors.deepNavy, fontFamily: fontFamilySemiBold, fontSize: 15 },
  iconBtn: {
    alignItems: "center",
    borderColor: "#E7E9F2",
    borderRadius: 16,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  hint: { color: colors.midGrey, fontSize: 13, marginTop: 6 },
  tz: { color: colors.midGrey, fontSize: 14, marginTop: 8 },
  alert: {
    backgroundColor: colors.white,
    borderColor: "#E11D48",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
  },
  card: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 12,
    padding: 14,
  },
  cardTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  since: { color: colors.midGrey, fontSize: 13 },
  issue: { color: colors.nearBlack, fontSize: 16, lineHeight: 22, marginTop: 8 },
  primary: {
    alignItems: "center",
    backgroundColor: colors.indigo,
    borderRadius: 16,
    height: 48,
    justifyContent: "center",
    marginTop: 12,
  },
  primaryText: { color: colors.white, fontFamily: fontFamilySemiBold, fontSize: 16 },
  tinted: {
    alignItems: "center",
    backgroundColor: "#EDEAFF",
    borderRadius: 16,
    height: 44,
    justifyContent: "center",
    marginTop: 10,
  },
  tintedText: { color: colors.indigo, fontFamily: fontFamilySemiBold, fontSize: 16 },
  sectionHead: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
  },
  section: { color: colors.deepNavy, fontFamily: fontFamilySemiBold, fontSize: 18 },
  sectionMeta: { color: colors.midGrey, fontSize: 13 },
  link: { color: colors.indigo, fontFamily: fontFamilySemiBold, fontSize: 15 },
  week: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 8,
    paddingVertical: 10,
  },
  day: { alignItems: "center", flex: 1 },
  dayLabel: { color: colors.midGrey, fontSize: 12 },
  dayCount: { color: colors.deepNavy, fontFamily: fontFamilyMedium, fontSize: 12, marginTop: 6 },
  tiles: { flexDirection: "row", gap: 8, marginTop: 8 },
  tile: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    padding: 10,
  },
  tileValue: { color: colors.deepNavy, fontFamily: fontFamilySemiBold, fontSize: 14 },
  tileLabel: { color: colors.midGrey, fontSize: 12, marginTop: 4 },
  activity: { marginTop: 10 },
  name: { color: colors.deepNavy, fontFamily: fontFamilySemiBold, fontSize: 15 },
  input: {
    color: colors.deepNavy,
    fontSize: 16,
    minHeight: 72,
  },
  switchRow: { minHeight: 44, justifyContent: "center" },
  ended: {
    backgroundColor: "#F3F1FA",
    borderRadius: 12,
    marginBottom: 8,
    padding: 12,
  },
  endedText: { color: colors.deepNavy, fontSize: 14 },
  offline: { color: colors.deepNavy, fontSize: 14, marginBottom: 8 },
  skeleton: {
    backgroundColor: "#E7E9F2",
    borderRadius: 20,
    height: 120,
    marginBottom: 12,
  },
});
