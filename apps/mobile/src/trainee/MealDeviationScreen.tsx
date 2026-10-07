import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { MealAssignment, MealDeviationKind } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";

const DEVIATION_OPTIONS: Array<{
  kind: MealDeviationKind;
  label: string;
  description: string;
}> = [
  {
    kind: "portion_adjustment",
    label: "Portion change",
    description: "Ate more or less than prescribed.",
  },
  {
    kind: "substitute",
    label: "Substitute",
    description: "Swapped for a similar meal.",
  },
  {
    kind: "restaurant",
    label: "Restaurant",
    description: "Ate out instead of the plan.",
  },
  {
    kind: "repeat_recent",
    label: "Repeat recent",
    description: "Repeated a recent meal.",
  },
  {
    kind: "manual",
    label: "Manual log",
    description: "Quick free-text log.",
  },
  {
    kind: "other",
    label: "Other",
    description: "Something else changed.",
  },
];

export function MealDeviationScreen({
  assignment,
  loading,
  onCancel,
  onSubmit,
}: {
  assignment: MealAssignment;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    deviationKind: MealDeviationKind;
    notes: string | null;
  }) => Promise<void>;
}) {
  const [kind, setKind] = useState<MealDeviationKind>("portion_adjustment");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <Screen
      title="Meal Deviation"
      subtitle={`${assignment.mealName} · lightweight change`}
    >
      {error ? <ErrorBanner message={error} /> : null}
      <View style={styles.stack}>
        <Text style={styles.lead}>
          Photos are evidence context, not proof or lie detection.
          {assignment.photoRequired
            ? " A photo association will be noted with this log."
            : ""}
        </Text>

        {DEVIATION_OPTIONS.map((option) => {
          const selected = option.kind === kind;
          return (
            <Pressable
              key={option.kind}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setKind(option.kind)}
              style={[styles.option, selected ? styles.optionSelected : null]}
            >
              <Text style={styles.optionTitle}>{option.label}</Text>
              <Text style={styles.optionBody}>{option.description}</Text>
            </Pressable>
          );
        })}

        <Text style={styles.label}>Optional note</Text>
        <TextInput
          accessibilityLabel="Deviation notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Short context for your trainer"
          placeholderTextColor={colors.midGrey}
          multiline
          style={styles.input}
        />

        <PrimaryButton
          label="Save deviation"
          loading={loading}
          onPress={() => {
            void (async () => {
              setError(null);
              try {
                await onSubmit({
                  deviationKind: kind,
                  notes: notes.trim() ? notes.trim() : null,
                });
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Could not save deviation.",
                );
              }
            })();
          }}
        />
        <PrimaryButton label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  lead: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  option: {
    borderWidth: 1,
    borderColor: colors.lightGrey,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.xs,
    backgroundColor: colors.white,
  },
  optionSelected: {
    borderColor: colors.indigo,
    backgroundColor: colors.paleLavender,
  },
  optionTitle: {
    color: colors.nearBlack,
    fontSize: 15,
    fontWeight: "600",
  },
  optionBody: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    color: colors.deepNavy,
    fontSize: 13,
    fontWeight: "600",
    marginTop: spacing.sm,
  },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: colors.lightGrey,
    borderRadius: 12,
    padding: spacing.md,
    color: colors.nearBlack,
    fontSize: 15,
    textAlignVertical: "top",
    backgroundColor: colors.white,
  },
});
