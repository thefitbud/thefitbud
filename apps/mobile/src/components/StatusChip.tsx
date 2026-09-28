import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "@fitbud/ui-mobile";

type Tone = "neutral" | "positive" | "attention" | "warning";

export function StatusChip({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: Tone;
}) {
  return (
    <View
      style={[
        styles.chip,
        tone === "positive" && styles.positive,
        tone === "attention" && styles.attention,
        tone === "warning" && styles.warning,
      ]}
    >
      <Text
        style={[
          styles.label,
          tone === "positive" && styles.positiveLabel,
          tone === "attention" && styles.attentionLabel,
          tone === "warning" && styles.warningLabel,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    backgroundColor: colors.lightGrey,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  positive: {
    backgroundColor: "#ECFDF5",
  },
  attention: {
    backgroundColor: colors.paleLavender,
  },
  warning: {
    backgroundColor: "#FFF7ED",
  },
  label: {
    color: colors.darkGrey,
    fontSize: 12,
    fontWeight: "600",
  },
  positiveLabel: {
    color: "#047857",
  },
  attentionLabel: {
    color: colors.indigo,
  },
  warningLabel: {
    color: "#B45309",
  },
});
