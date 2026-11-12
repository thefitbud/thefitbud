import { StyleSheet, View } from "react-native";
import { Check, Minus, X } from "lucide-react-native";
import { colors, fontFamilyMedium, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import type { WeekDayCell } from "./model";

export type WeekTile = { value: string; label: string };

/** Frames 18 and 74: seven day marks over a row of three figures. */
export function WeekCard({ cells, tiles }: { cells: WeekDayCell[]; tiles: WeekTile[] }) {
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
            <Text style={styles.dayCount}>{cell.count}</Text>
          </View>
        ))}
      </View>
      <View style={styles.tiles}>
        {tiles.map((tile, index) => (
          <View key={tile.label} style={[styles.tile, index > 0 ? styles.tileDivider : null]}>
            <Text style={styles.tileValue}>{tile.value}</Text>
            <Text style={styles.tileLabel}>{tile.label}</Text>
          </View>
        ))}
      </View>
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
  tiles: { borderColor: "#E7E9F2", borderTopWidth: 1, flexDirection: "row" },
  tile: { flex: 1, padding: 12 },
  tileDivider: { borderColor: "#E7E9F2", borderLeftWidth: 1 },
  tileValue: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  tileLabel: { color: colors.midGrey, fontSize: 12, marginTop: 4 },
});
