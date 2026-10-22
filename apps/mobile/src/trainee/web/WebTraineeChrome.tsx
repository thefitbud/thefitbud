import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../../components/Text";
import type { DateNavigatorDay, RingDatum } from "@fitbud/ui-mobile";
import { colors, spacing } from "@fitbud/ui-mobile";
import { formatHeadingDate } from "../../lib/dates";

export function isExpoWeb(): boolean {
  return Platform.OS === "web";
}

/** Expo web: avoid ui-mobile DateNavigator/NutritionRings until RN-web gap/SVG issues are resolved. */
function dotColor(state: DateNavigatorDay["state"]): string {
  switch (state) {
    case "done":
      return colors.success;
    case "partial":
      return colors.warning;
    case "open":
      return colors.indigo;
    case "rest":
      return colors.lightGrey;
    default:
      return colors.midGrey;
  }
}

export function WebDateHeading({
  timeZone,
  selectedDate,
  onSelectDate,
  today,
  days = [],
}: {
  timeZone: string;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  today: string;
  days?: DateNavigatorDay[];
}) {
  return (
    <View style={styles.dateBlock}>
      {days.length > 0 ? (
        <View style={styles.stripCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.stripRow}>
              {days.map((day) => {
                const selected = day.localDate === selectedDate;
                return (
                  <Pressable
                    key={day.localDate}
                    accessibilityRole="button"
                    onPress={() => onSelectDate(day.localDate)}
                    style={[
                      styles.dayPill,
                      selected ? styles.dayPillSelected : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.weekday,
                        selected ? styles.dayTextSelected : null,
                      ]}
                    >
                      {day.weekdayLabel}
                    </Text>
                    <Text
                      style={[
                        styles.dayNum,
                        selected ? styles.dayTextSelected : null,
                      ]}
                    >
                      {day.dayLabel}
                    </Text>
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: dotColor(day.state) },
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      ) : null}
    <View style={styles.dateRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous day"
        style={styles.chevronHit}
        onPress={() => {
          const [y, m, d] = selectedDate.split("-").map(Number);
          const prev = new Date(Date.UTC(y!, m! - 1, d! - 1));
          const iso = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-${String(prev.getUTCDate()).padStart(2, "0")}`;
          onSelectDate(iso);
        }}
      >
        <Text style={styles.chevron}>‹</Text>
      </Pressable>
      <Text style={styles.dateTitle}>
        {formatHeadingDate(timeZone, selectedDate)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next day"
        style={styles.chevronHit}
        onPress={() => {
          const [y, m, d] = selectedDate.split("-").map(Number);
          const next = new Date(Date.UTC(y!, m! - 1, d! + 1));
          const iso = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
          onSelectDate(iso);
        }}
      >
        <Text style={styles.chevron}>›</Text>
      </Pressable>
      {selectedDate !== today ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onSelectDate(today)}
          style={styles.todayPill}
        >
          <Text style={styles.todayPillText}>Today</Text>
        </Pressable>
      ) : null}
    </View>
    </View>
  );
}

export function WebNutritionSummary({ data }: { data: RingDatum[] }) {
  const kcal = data.find((row) => row.key === "kcal");
  const protein = data.find((row) => row.key === "protein");
  const assigned = kcal?.assigned ?? 0;
  const logged = kcal?.logged ?? 0;
  const line =
    kcal == null
      ? "Nutrition"
      : assigned > 0
        ? `${logged} / ${assigned} kcal`
        : logged > 0
          ? `${logged} kcal logged`
          : "No plan calories yet";
  return (
    <View style={styles.nutritionRow}>
      <Text style={styles.nutritionLine}>{line}</Text>
      {protein && assigned > 0 ? (
        <Text style={styles.nutritionSub}>
          Protein {protein.logged}g · Carbs{" "}
          {data.find((row) => row.key === "carbs")?.logged ?? 0}g · Fat{" "}
          {data.find((row) => row.key === "fat")?.logged ?? 0}g
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dateBlock: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  stripCard: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  stripRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  dayPill: {
    alignItems: "center",
    borderRadius: 12,
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  dayPillSelected: {
    backgroundColor: colors.white,
  },
  weekday: {
    color: colors.midGrey,
    fontSize: 11,
    fontWeight: "500",
  },
  dayNum: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "700",
  },
  dayTextSelected: {
    color: colors.indigo,
  },
  dot: {
    borderRadius: 4,
    height: 6,
    marginTop: 2,
    width: 6,
  },
  dateRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: spacing.md,
  },
  chevronHit: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
  },
  chevron: {
    color: colors.indigo,
    fontSize: 24,
    fontWeight: "600",
  },
  dateTitle: {
    color: colors.deepNavy,
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  todayPill: {
    backgroundColor: colors.paleLavender,
    borderRadius: 999,
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  todayPillText: {
    color: colors.indigo,
    fontSize: 12,
    fontWeight: "600",
  },
  nutritionRow: {
    marginBottom: spacing.md,
  },
  nutritionLine: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "700",
  },
  nutritionSub: {
    color: colors.midGrey,
    fontSize: 13,
    marginTop: spacing.xs,
  },
});
