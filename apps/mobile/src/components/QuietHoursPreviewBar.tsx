import { View } from "react-native";
import { Text } from "./Text";
import { createThemedStyles } from "../providers/ThemeProvider";
import { clockRange } from "../trainee/settings/clock";

function parseHm(value: string): number {
  const parts = value.split(":");
  const h = Number.parseInt(parts[0] ?? "0", 10);
  const m = Number.parseInt(parts[1] ?? "0", 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

/** 24-hour strip with the quiet period shaded (TR-17). */
export function QuietHoursPreviewBar({
  quietStart,
  quietEnd,
}: {
  quietStart: string;
  quietEnd: string;
}) {
  const styles = useStyles();
  const startMin = parseHm(quietStart);
  const endMin = parseHm(quietEnd);
  const segments = Array.from({ length: 24 }, (_, hour) => {
    const minute = hour * 60;
    let quiet = false;
    if (startMin < endMin) {
      quiet = minute >= startMin && minute < endMin;
    } else {
      quiet = minute >= startMin || minute < endMin;
    }
    return quiet;
  });

  return (
    <View style={styles.wrap} accessibilityLabel="Quiet hours preview">
      <View style={styles.bar}>
        {segments.map((quiet, hour) => (
          <View
            key={hour}
            style={[styles.segment, quiet ? styles.quiet : styles.active]}
          />
        ))}
      </View>
      <View style={styles.labels}>
        <Text style={styles.tick}>12 am</Text>
        <Text style={styles.tick}>6 am</Text>
        <Text style={styles.tick}>12 pm</Text>
        <Text style={styles.tick}>6 pm</Text>
        <Text style={styles.tick}>12 am</Text>
      </View>
      <Text style={styles.legend}>
        Shaded: no notifications ({clockRange(quietStart, quietEnd)})
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  wrap: {
    gap: t.spacing.xs,
  },
  bar: {
    borderRadius: 8,
    flexDirection: "row",
    height: 20,
    overflow: "hidden",
  },
  segment: {
    flex: 1,
  },
  quiet: {
    backgroundColor: t.colors.ink3,
  },
  active: {
    backgroundColor: t.colors.fill2,
  },
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  tick: {
    color: t.colors.ink3,
    fontSize: 10.5,
  },
  legend: {
    ...t.text.caption.style,
    color: t.colors.ink3,
  },
}));
