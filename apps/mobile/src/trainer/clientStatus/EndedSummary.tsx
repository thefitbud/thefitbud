import { StyleSheet, View } from "react-native";
import { Scale } from "lucide-react-native";
import { formatCivilDate } from "@fitbud/core";
import { colors, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import type { EndedSummary as Summary } from "./model";
import { WeekCard } from "./WeekCard";

const DASH = "–";

/** Frame 74: coaching summary and the last active week, read-only. */
export function EndedSummary({ summary }: { summary: Summary }) {
  const { lastWeek } = summary;
  return (
    <View>
      <Text style={styles.section}>Coaching summary</Text>
      <View style={styles.card}>
        <View style={styles.tiles}>
          <Fig value={`${summary.weeksCoached} ${summary.weeksCoached === 1 ? "week" : "weeks"}`} label="Coached" />
          <Fig value={summary.workouts ?? DASH} label="Workouts" divider />
          <Fig value={summary.checkins ?? DASH} label="Check-ins" divider />
        </View>
        {summary.weight ? (
          <View style={styles.weightRow}>
            <View style={styles.weightIcon}>
              <Scale size={20} color={colors.midGrey} />
            </View>
            <View style={styles.weightBody}>
              <Text style={styles.weightHead}>{summary.weight.headline}</Text>
              {summary.weight.sub ? <Text style={styles.weightSub}>{summary.weight.sub}</Text> : null}
            </View>
          </View>
        ) : null}
      </View>
      <View style={styles.sectionHead}>
        <Text style={styles.section}>Last week</Text>
        <Text style={styles.sectionMeta}>
          {formatCivilDate(summary.lastWeekStart)} – {formatCivilDate(summary.endDate)}
        </Text>
      </View>
      <WeekCard
        cells={lastWeek.cells}
        tiles={[
          { value: lastWeek.workouts ?? DASH, label: "Workouts" },
          { value: lastWeek.meals ?? DASH, label: "Meals logged" },
          { value: lastWeek.lastCheckin, label: "Last check-in" },
        ]}
      />
    </View>
  );
}

function Fig({ value, label, divider }: { value: string; label: string; divider?: boolean }) {
  return (
    <View style={[styles.fig, divider ? styles.figDivider : null]}>
      <Text style={styles.figValue}>{value}</Text>
      <Text style={styles.figLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { color: colors.deepNavy, fontFamily: fontFamilySemiBold, fontSize: 18, marginTop: 18 },
  sectionHead: { alignItems: "baseline", flexDirection: "row", gap: 8 },
  sectionMeta: { color: colors.midGrey, fontSize: 13 },
  card: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 8,
    overflow: "hidden",
  },
  tiles: { flexDirection: "row" },
  fig: { flex: 1, padding: 12 },
  figDivider: { borderColor: "#E7E9F2", borderLeftWidth: 1 },
  figValue: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  figLabel: { color: colors.midGrey, fontSize: 12, marginTop: 4 },
  weightRow: { alignItems: "center", flexDirection: "row", gap: 12, padding: 12 },
  weightIcon: {
    alignItems: "center",
    backgroundColor: "#F3F1FA",
    borderRadius: 12,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  weightBody: { flex: 1 },
  weightHead: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
    fontVariant: ["tabular-nums"],
  },
  weightSub: { color: colors.midGrey, fontSize: 13, marginTop: 2 },
});
