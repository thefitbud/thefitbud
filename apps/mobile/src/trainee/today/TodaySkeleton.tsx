import { StyleSheet, View } from "react-native";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { surface } from "@fitbud/tokens";
import { Text } from "../../components/Text";

/**
 * Loading state shaped like Today v3 (frame 96): summary card with ring,
 * three macro bars and three chips, the day card, and the Meals list. Static
 * blocks: motion is for state change, not for waiting.
 */
function Block({ style }: { style: object }) {
  return <View style={[styles.block, style]} />;
}

export function TodaySkeleton() {
  return (
    <View style={styles.stack} accessibilityLabel="Loading today">
      {/* Kept as text for screen readers and the Maestro wait on it. */}
      <Text style={styles.srOnly}>Loading your day…</Text>
      <View style={styles.summary}>
        <View style={styles.summaryTop}>
          <View style={styles.ring} />
          <View style={styles.bars}>
            {[0, 1, 2].map((row) => (
              <View key={row} style={styles.barRow}>
                <View style={styles.barText}>
                  <Block style={styles.label} />
                  <Block style={styles.value} />
                </View>
                <Block style={styles.track} />
              </View>
            ))}
          </View>
        </View>
        <View style={styles.chips}>
          {[0, 1, 2].map((chip) => (
            <Block key={chip} style={styles.chip} />
          ))}
        </View>
      </View>

      <View style={styles.day}>
        <View style={styles.dayChip} />
        <View style={styles.dayLine} />
        <View style={styles.dayButton} />
      </View>

      <View style={styles.mealsHead}>
        <Text style={styles.mealsLabel}>Meals</Text>
        <Block style={styles.mealsCount} />
      </View>
      <View style={styles.list}>
        {[0, 1, 2].map((row) => (
          <View key={row} style={[styles.row, row > 0 && styles.rowRule]}>
            <Block style={styles.time} />
            <View style={styles.rowMain}>
              <Block style={styles.rowName} />
              <Block style={styles.rowMeta} />
            </View>
            <Block style={styles.rowChip} />
          </View>
        ))}
      </View>
    </View>
  );
}

const BLOCK = "#ECEAF4";

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  block: { backgroundColor: BLOCK, borderRadius: 8 },
  srOnly: { height: 1, overflow: "hidden", position: "absolute", width: 1 },
  summary: {
    backgroundColor: colors.white,
    borderColor: surface.border,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  summaryTop: { alignItems: "center", flexDirection: "row", gap: spacing.lg },
  ring: {
    borderColor: BLOCK,
    borderRadius: 54,
    borderWidth: 10,
    height: 108,
    width: 108,
  },
  bars: { flex: 1, gap: spacing.sm },
  barRow: { gap: 6 },
  barText: { flexDirection: "row", justifyContent: "space-between" },
  label: { height: 12, width: 56 },
  value: { height: 12, width: 56 },
  track: { height: 6, borderRadius: 3 },
  chips: { flexDirection: "row", gap: spacing.sm },
  chip: { borderRadius: 16, flex: 1, height: 48 },
  day: {
    backgroundColor: "#E6E4F0",
    borderRadius: 22,
    gap: spacing.md,
    padding: spacing.md,
  },
  dayChip: {
    alignSelf: "flex-start",
    backgroundColor: "#F4F3FA",
    borderRadius: 14,
    height: 28,
    width: 110,
  },
  dayLine: { backgroundColor: "#F4F3FA", borderRadius: 8, height: 20, width: 190 },
  dayButton: { backgroundColor: "#F4F3FA", borderRadius: 24, height: 48 },
  mealsHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  mealsLabel: { color: colors.deepNavy, fontSize: 17, fontWeight: "700" },
  mealsCount: { height: 12, width: 80 },
  list: {
    backgroundColor: colors.white,
    borderColor: surface.border,
    borderRadius: radii.card,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 58,
    padding: spacing.md,
  },
  rowRule: { borderTopColor: colors.lightGrey, borderTopWidth: 1 },
  time: { height: 12, width: 50 },
  rowMain: { flex: 1, gap: 6 },
  rowName: { height: 14, width: 100 },
  rowMeta: { height: 10, width: 140 },
  rowChip: { borderRadius: 16, height: 28, width: 76 },
});
