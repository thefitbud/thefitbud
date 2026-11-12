import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Check, Lock, X } from "lucide-react-native";
import type { ExceptionDetail, ResolveExceptionRequest } from "@fitbud/contracts";
import {
  colors,
  defaultTextStyle,
  fontFamilyMedium,
  radii,
  spacing,
  touchTargetMin,
} from "@fitbud/ui-mobile";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { Text } from "../../components/Text";
import {
  RESOLVE_OUTCOMES,
  resolveLockLine,
  resolveSheetSubtitle,
} from "./exceptionSheetContent";

export type ResolveOutcome = Exclude<
  NonNullable<ResolveExceptionRequest["outcome"]>,
  "other"
>;
type Outcome = ResolveOutcome;

type Props = {
  visible: boolean;
  detail: Pick<ExceptionDetail, "type" | "details">;
  traineeDisplayName: string;
  acting?: boolean;
  /** Static, curated error text shown inside the sheet. */
  errorMessage?: string | null;
  onDismiss: () => void;
  onConfirm: (input: { outcome: Outcome | null; note: string | null }) => void;
};

/** Frame 33: confirm before resolving, optional outcome chip and note. */
export function ResolveSheet({
  visible,
  detail,
  traineeDisplayName,
  acting = false,
  errorMessage,
  onDismiss,
  onConfirm,
}: Props) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (visible) {
      setOutcome(null);
      setNote("");
    }
  }, [visible]);

  return (
    <BottomSheet visible={visible} headerless onDismiss={onDismiss}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">
            Resolve this item?
          </Text>
          <Text style={styles.subtitle}>
            {resolveSheetSubtitle(detail, traineeDisplayName)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onDismiss}
          style={styles.close}
        >
          <X size={20} color={colors.darkGrey} />
        </Pressable>
      </View>

      <Text style={styles.label}>
        What happened? <Text style={styles.labelMuted}>Optional</Text>
      </Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {RESOLVE_OUTCOMES.map((option) => {
          const selected = outcome === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setOutcome(selected ? null : option.value)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              {selected ? <Check size={18} color={colors.indigo} /> : null}
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>
        Note <Text style={styles.labelMuted}>· optional</Text>
      </Text>
      <TextInput
        accessibilityLabel="Note"
        multiline
        value={note}
        onChangeText={setNote}
        maxLength={2000}
        placeholderTextColor={colors.midGrey}
        style={styles.input}
      />

      <View style={styles.lockCard}>
        <Lock size={20} color={colors.darkGrey} />
        <Text style={styles.lockText}>{resolveLockLine(traineeDisplayName)}</Text>
      </View>

      {errorMessage ? (
        <Text style={styles.error} accessibilityRole="alert">
          {errorMessage}
        </Text>
      ) : null}

      <Button
        label="Resolve"
        loading={acting}
        onPress={() =>
          onConfirm({ outcome, note: note.trim() ? note.trim() : null })
        }
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  headerText: { flex: 1, gap: spacing.xs },
  title: { color: colors.deepNavy, fontSize: 24, fontWeight: "600" },
  subtitle: { color: colors.midGrey, fontSize: 14, lineHeight: 20 },
  close: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderRadius: 999,
    height: touchTargetMin,
    justifyContent: "center",
    width: touchTargetMin,
  },
  label: {
    color: colors.darkGrey,
    fontFamily: fontFamilyMedium,
    fontSize: 14,
  },
  labelMuted: { color: colors.midGrey },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    alignItems: "center",
    borderColor: colors.lightGrey,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: touchTargetMin,
    paddingHorizontal: spacing.lg,
  },
  chipSelected: {
    backgroundColor: colors.paleLavender,
    borderColor: colors.indigo,
  },
  chipText: { color: colors.deepNavy, fontSize: 16 },
  chipTextSelected: { color: colors.indigo },
  input: {
    ...defaultTextStyle,
    borderColor: colors.lightGrey,
    borderRadius: radii.card,
    borderWidth: 1,
    minHeight: 88,
    padding: spacing.md,
    textAlignVertical: "top",
  },
  lockCard: {
    alignItems: "flex-start",
    backgroundColor: colors.background,
    borderColor: colors.lightGrey,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  lockText: { color: colors.darkGrey, flex: 1, fontSize: 15, lineHeight: 22 },
  error: { color: colors.error, fontSize: 14 },
});
