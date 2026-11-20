import { StyleSheet, View } from "react-native";
import { Check, Minus, X } from "lucide-react-native";
import { colors, fontFamilyMedium, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import type { WeekDayCell } from "./model";

export type WeekTile = { value: string; label: string };

/** Frames 18 / TM-03a: seven day marks, then workout/meal counts. */
export function WeekCard({
  cells,
  tiles,
  showCounts = false,
}: {
  cells: WeekDayCell[];
  tiles: WeekTile[];
  /** Per-day "1/1" under the dots — off in v3 (TM-03a). */
  showCounts?: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.week}>
        {cells.map((cell) => (
          <View
            key={cell.date}
            style={styles.day}
            accessible
            accessibilityLabel={`${cell.letter}: ${cell.mark === "done" ? "done" : cell.mark === "missed" ? "missed" : "nothing logged"}, ${cell.count}`}
          >
            <Text style={styles.dayLabel}>{cell.letter}</Text>
            <View
              style={[
                styles.mark,
                cell.mark === "done" ? styles.markDone : null,
                cell.mark === "missed" ? styles.markMissed : null,
              ]}
            >
              {cell.mark === "done" ? (
                <Check size={16} color={colors.white} />
              ) : cell.mark === "missed" ? (
                <X size={16} color="#B91C1C" />
              ) : (
                <Minus size={14} color={colors.midGrey} />
              )}
            </View>
            {showCounts ? <Text style={styles.dayCount}>{cell.count}</Text> : null}
          </View>
        ))}
      </View>
      {tiles.length > 0 ? (
        <View style={styles.stats}>
          {tiles.map((tile) => (
            <Text key={tile.label} style={styles.stat}>
              <Text style={styles.statValue}>{tile.value}</Text>
              {` ${tile.label}`}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 8,
    overflow: "hidden",
  },
  week: { flexDirection: "row", paddingVertical: 12 },
  day: { alignItems: "center", flex: 1 },
  dayLabel: { color: colors.midGrey, fontSize: 12 },
  mark: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: 14,
    borderWidth: 1.5,
    height: 28,
    justifyContent: "center",
    marginTop: 6,
    width: 28,
  },
  markDone: { backgroundColor: colors.deepNavy },
  markMissed: { borderColor: "#B91C1C" },
  dayCount: {
    color: colors.deepNavy,
    fontFamily: fontFamilyMedium,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    marginTop: 6,
  },
  stats: {
    borderColor: "#E7E9F2",
    borderTopWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  stat: { color: colors.midGrey, fontSize: 14 },
  statValue: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontVariant: ["tabular-nums"],
  },
});
