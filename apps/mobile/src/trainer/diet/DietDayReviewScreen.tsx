/**
 * TM-12a: trainer diet-day review — planned vs actual per meal, day ring + macros.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Pencil,
  RefreshCw,
  UtensilsCrossed,
} from "lucide-react-native";
import Svg, { Circle } from "react-native-svg";
import type { MealAssignment } from "@fitbud/contracts";
import {
  formatCivilDate,
  formatNumber,
  formatPersonName,
} from "@fitbud/core";
import type { ColorTokens } from "@fitbud/tokens";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Screen } from "../../components/Screen";
import { Text } from "../../components/Text";
import { initialsFromName } from "../../components/m2";
import { addDays, localDateInTimezone } from "../../lib/dates";
import { createIdempotencyKey } from "../../lib/idempotency";
import { reportError } from "../../lib/reportError";
import {
  dayNutritionFromMeals,
  isMealLoggedForCount,
} from "../../trainee/nutrition";
import { NoteSheet, type NoteSaveInput } from "../sheets/NoteSheet";
import {
  createThemedStyles,
  useTheme,
} from "../../providers/ThemeProvider";
import { isClientEdited } from "../activity/model";
import { DietMealSheet } from "./DietMealSheet";
import {
  dietMealBadge,
  loggedFoodLine,
  mealKcalPair,
  mealTimeLabel,
  mealsLoggedCount,
  planFoodLine,
  type DietMealBadge,
} from "./model";

type Props = {
  relationshipId: string;
  displayName: string;
  clientZone: string;
  whatsappE164?: string | null;
  /** Civil date to open on (defaults to today in the client's zone). */
  initialDate?: string;
  /**
   * Z14-16: open the meal sheet on the entry (a meal compliance id) once the
   * day loads, e.g. from a "client edited a meal" notification. An entry that is
   * no longer on the day (removed) opens the day with nothing selected.
   */
  initialEntryId?: string | null;
  onBack: () => void;
};

function avatars(c: ColorTokens) {
  return [
    { backgroundColor: c.av1Bg, color: c.av1Fg },
    { backgroundColor: c.av2Bg, color: c.av2Fg },
    { backgroundColor: c.av3Bg, color: c.av3Fg },
    { backgroundColor: c.av4Bg, color: c.av4Fg },
    { backgroundColor: c.av5Bg, color: c.av5Fg },
    { backgroundColor: c.av6Bg, color: c.av6Fg },
  ] as const;
}

function avatarTone(name: string, c: ColorTokens) {
  const list = avatars(c);
  const code = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return list[code % list.length] ?? list[0]!;
}

function MacroBar({
  label,
  logged,
  assigned,
  color,
}: {
  label: string;
  logged: number;
  assigned: number;
  color: string;
}) {
  const styles = useStyles();
  const pct =
    assigned > 0 ? Math.min(100, Math.round((logged / assigned) * 100)) : 0;
  return (
    <View style={styles.macroRow}>
      <Text style={styles.macroLabel}>{label}</Text>
      <View style={styles.macroTrack}>
        <View
          style={[
            styles.macroFill,
            { width: `${pct}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={styles.macroNums}>
        {`${formatNumber(logged)} / ${formatNumber(assigned)} g`}
      </Text>
    </View>
  );
}

function KcalRingMini({
  logged,
  assigned,
}: {
  logged: number;
  assigned: number;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const size = 96;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = assigned > 0 ? Math.min(logged / assigned, 1) : 0;
  const mid = size / 2;
  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityLabel={`${formatNumber(logged)} kcal of ${formatNumber(assigned)}`}
      testID="diet-day-kcal-ring"
    >
      <Svg width={size} height={size}>
        <Circle
          cx={mid}
          cy={mid}
          r={radius}
          stroke={theme.colors.fill}
          strokeWidth={stroke}
          fill="none"
        />
        {progress > 0 ? (
          <Circle
            cx={mid}
            cy={mid}
            r={radius}
            stroke={theme.colors.brand}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${circumference * progress} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${mid} ${mid})`}
          />
        ) : null}
      </Svg>
      <View style={styles.ringCenter} pointerEvents="none">
        <Text style={styles.ringNumber}>{formatNumber(logged)}</Text>
        <Text style={styles.ringUnit}>kcal</Text>
      </View>
    </View>
  );
}

function badgeIcon(badge: DietMealBadge, color: string) {
  if (badge.kind === "as_planned") {
    return <Check size={12} strokeWidth={2.6} color={color} />;
  }
  if (badge.kind === "ate_out") {
    return <UtensilsCrossed size={12} strokeWidth={2.2} color={color} />;
  }
  if (badge.kind === "not_due") {
    return <Clock size={12} strokeWidth={2.2} color={color} />;
  }
  if (badge.kind === "changed_portion" || badge.kind === "changed") {
    return <RefreshCw size={12} strokeWidth={2.2} color={color} />;
  }
  return null;
}

export function DietDayReviewScreen({
  relationshipId,
  displayName,
  clientZone,
  whatsappE164,
  initialDate,
  initialEntryId,
  onBack,
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const { api } = useAuth();
  const today = localDateInTimezone(clientZone);
  const [date, setDate] = useState(initialDate ?? today);
  const [meals, setMeals] = useState<MealAssignment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<MealAssignment | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteActing, setNoteActing] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const name = formatPersonName(displayName);
  const tone = avatarTone(name, theme.colors);
  const initials = initialsFromName(name);

  const load = useCallback(async () => {
    setError(null);
    try {
      const page = await api.listMealAssignments(relationshipId, {
        fromDate: date,
        toDate: date,
      });
      setMeals(page.items);
    } catch (err) {
      reportError("diet-day-review.load", err);
      setError("Couldn't load this day's food. Try again.");
      setMeals(null);
    } finally {
      setLoading(false);
    }
  }, [api, relationshipId, date]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const entryOpened = useRef(false);
  useEffect(() => {
    if (!initialEntryId || entryOpened.current || !meals) return;
    entryOpened.current = true;
    const match = meals.find((meal) => meal.compliance?.id === initialEntryId);
    if (match) setPicked(match);
  }, [initialEntryId, meals]);

  const dayMeals = useMemo(
    () =>
      [...(meals ?? [])].sort(
        (a, b) => Date.parse(a.windowStartsAt) - Date.parse(b.windowStartsAt),
      ),
    [meals],
  );
  const nutrition = useMemo(
    () => dayNutritionFromMeals(dayMeals),
    [dayMeals],
  );
  const counts = mealsLoggedCount(dayMeals);

  async function saveNote(input: NoteSaveInput) {
    setNoteActing(true);
    setNoteError(null);
    try {
      await api.createTrainerNote(
        relationshipId,
        {
          body: input.body,
          visibility: input.visibility,
        },
        createIdempotencyKey(),
      );
      setNoteOpen(false);
      setPicked(null);
    } catch (err) {
      reportError("diet-day-review.note", err);
      setNoteError("Couldn't save the note. Try again.");
    } finally {
      setNoteActing(false);
    }
  }

  return (
    <Screen
      v3
      title="Food"
      chrome="app"
      showHeader={false}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load().finally(() => setRefreshing(false));
      }}
    >
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.navBtn}
        >
          <Text style={styles.navChevron}>‹</Text>
        </Pressable>
        <Text style={styles.navTitle} accessibilityRole="header">
          Food
        </Text>
        <View style={styles.dateNav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous day"
            onPress={() => setDate((d) => addDays(d, -1))}
            style={styles.dateBtn}
          >
            <ChevronLeft color={theme.colors.ink} size={22} strokeWidth={2.2} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next day"
            onPress={() => setDate((d) => addDays(d, 1))}
            style={styles.dateBtn}
            disabled={date >= today}
          >
            <ChevronRight
              color={date >= today ? theme.colors.ink4 : theme.colors.ink}
              size={22}
              strokeWidth={2.2}
            />
          </Pressable>
        </View>
      </View>

      {error ? <ErrorBanner message={error} /> : null}

      <View style={styles.person}>
        <View style={[styles.avatar, { backgroundColor: tone.backgroundColor }]}>
          <Text style={[styles.avatarText, { color: tone.color }]}>
            {initials}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.personName}>{name}</Text>
          <Text style={styles.personMeta}>
            {`${formatCivilDate(date)}${
              nutrition.assigned.kcal > 0
                ? ` · plan ${formatNumber(nutrition.assigned.kcal)} kcal`
                : ""
            }`}
          </Text>
        </View>
      </View>

      <View style={styles.summary} testID="diet-day-summary">
        <KcalRingMini
          logged={nutrition.logged.kcal}
          assigned={nutrition.assigned.kcal}
        />
        <View style={styles.macros}>
          <MacroBar
            label="Protein"
            logged={nutrition.logged.protein}
            assigned={nutrition.assigned.protein}
            color={theme.colors.protein}
          />
          <MacroBar
            label="Carbs"
            logged={nutrition.logged.carbs}
            assigned={nutrition.assigned.carbs}
            color={theme.colors.carbs}
          />
          <MacroBar
            label="Fat"
            logged={nutrition.logged.fat}
            assigned={nutrition.assigned.fat}
            color={theme.colors.fat}
          />
        </View>
      </View>

      <Text style={styles.section}>
        {`Meals · ${counts.logged} of ${counts.total} logged`.toUpperCase()}
      </Text>

      {loading && !meals ? (
        <Text style={styles.empty}>Loading…</Text>
      ) : dayMeals.length === 0 ? (
        <Text style={styles.empty}>No meals on this day.</Text>
      ) : (
        dayMeals.map((meal) => {
          const badge = dietMealBadge(meal);
          const { logged, planned } = mealKcalPair(meal);
          const food =
            isMealLoggedForCount(meal.status) && meal.status === "modified"
              ? (loggedFoodLine(meal) ?? planFoodLine(meal))
              : planFoodLine(meal);
          const badgeColor =
            badge.kind === "as_planned"
              ? theme.colors.done
              : badge.kind === "ate_out" || badge.kind === "changed_portion"
                ? theme.colors.warn
                : theme.colors.ink3;
          const badgeBg =
            badge.kind === "as_planned"
              ? theme.colors.doneTint
              : badge.kind === "ate_out" || badge.kind === "changed_portion"
                ? theme.colors.warnTint
                : theme.colors.fill;
          return (
            <Pressable
              key={meal.id}
              accessibilityRole="button"
              accessibilityLabel={`${meal.mealName}, ${badge.label}`}
              onPress={() => setPicked(meal)}
              style={styles.mealRow}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.mealTitle}>
                  {`${meal.mealName} · ${mealTimeLabel(meal, clientZone)}`}
                </Text>
                <Text style={styles.mealFood} numberOfLines={2}>
                  {food}
                </Text>
                <View style={[styles.mealBadge, { backgroundColor: badgeBg }]}>
                  {badgeIcon(badge, badgeColor)}
                  <Text style={[styles.mealBadgeText, { color: badgeColor }]}>
                    {badge.label}
                  </Text>
                </View>
                {isClientEdited(meal.compliance) ? (
                  <View
                    style={[styles.mealBadge, { backgroundColor: theme.colors.fill }]}
                    testID="diet-meal-edited-tag"
                  >
                    <Pencil size={12} strokeWidth={2.2} color={theme.colors.ink2} />
                    <Text style={[styles.mealBadgeText, { color: theme.colors.ink2 }]}>
                      Edited
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.mealKcal}>
                {logged != null
                  ? `${formatNumber(logged)} / ${formatNumber(planned)}`
                  : `— / ${formatNumber(planned)}`}
              </Text>
            </Pressable>
          );
        })
      )}

      <DietMealSheet
        visible={picked != null && !noteOpen}
        meal={picked}
        displayName={name}
        whatsappE164={whatsappE164}
        clientZone={clientZone}
        onDismiss={() => setPicked(null)}
        onAddNote={() => setNoteOpen(true)}
      />
      <NoteSheet
        visible={noteOpen}
        traineeDisplayName={name}
        acting={noteActing}
        errorMessage={noteError}
        onDismiss={() => {
          setNoteOpen(false);
          setNoteError(null);
        }}
        onSave={(input) => void saveNote(input)}
      />
    </Screen>
  );
}

const useStyles = createThemedStyles((t) => ({
  nav: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 12,
  },
  navBtn: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  navChevron: {
    color: t.colors.ink,
    fontSize: 32,
    lineHeight: 36,
    marginTop: -2,
  },
  navTitle: {
    color: t.colors.ink,
    flex: 1,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
    textAlign: "center",
  },
  dateNav: { flexDirection: "row" },
  dateBtn: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 36,
  },
  person: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  avatar: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  avatarText: { fontFamily: fontFamilySemiBold, fontSize: 14 },
  personName: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
  },
  personMeta: { color: t.colors.ink3, fontSize: 13, marginTop: 2 },
  summary: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 14,
    marginBottom: 20,
    padding: 14,
  },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  ringNumber: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 20,
  },
  ringUnit: { color: t.colors.ink3, fontSize: 12 },
  macros: { flex: 1, gap: 8, justifyContent: "center" },
  macroRow: { gap: 2 },
  macroLabel: {
    color: t.colors.ink2,
    fontFamily: fontFamilySemiBold,
    fontSize: 12,
  },
  macroTrack: {
    backgroundColor: t.colors.fill,
    borderRadius: 999,
    height: 6,
    overflow: "hidden",
  },
  macroFill: { borderRadius: 999, height: 6 },
  macroNums: { color: t.colors.ink3, fontSize: 12 },
  section: {
    color: t.colors.ink3,
    fontFamily: fontFamilySemiBold,
    fontSize: 12,
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  empty: { color: t.colors.ink3, fontSize: 15, paddingVertical: 24 },
  mealRow: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
    padding: 14,
  },
  mealTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
  },
  mealFood: { color: t.colors.ink2, fontSize: 13, marginTop: 2 },
  mealBadge: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mealBadgeText: { fontFamily: fontFamilySemiBold, fontSize: 12 },
  mealKcal: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 14,
  },
}));
