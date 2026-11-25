import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Lock, X } from "lucide-react-native";
import type { ExceptionDetail, ResolveExceptionRequest } from "@fitbud/contracts";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { Text } from "../../components/Text";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../../providers/ThemeProvider";
import {
  RESOLVE_OUTCOMES,
  firstNameOf,
  resolveLockLine,
  resolveSheetSubtitle,
} from "./exceptionSheetContent";
import { resolvedOutcomePhrase } from "./exceptionStateContent";

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

/**
 * TM-04d: the trainer resolves the item, with an optional outcome and a
 * private note, after reading the lock helper. Only the trainer resolves
 * (AGENTS.md); nothing here resolves on its own. The sheet follows the system
 * theme itself, so it reads right over a screen that has not migrated yet.
 */
export function ResolveSheet(props: Props) {
  return (
    <ThemeScope scheme="system" drivesSystemBars={false}>
      <ResolveSheetBody {...props} />
    </ThemeScope>
  );
}

function ResolveSheetBody({
  visible,
  detail,
  traineeDisplayName,
  acting = false,
  errorMessage,
  onDismiss,
  onConfirm,
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState("");
  const first = firstNameOf(traineeDisplayName);

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
          <Text variant="title" accessibilityRole="header">
            Resolve
          </Text>
          <Text variant="subhead">
            {resolveSheetSubtitle(detail, traineeDisplayName)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onDismiss}
          style={styles.close}
        >
          <X size={20} color={theme.colors.ink} />
        </Pressable>
      </View>

      <Text variant="label" style={styles.label}>
        Outcome
      </Text>
      <View style={styles.rows} accessibilityRole="radiogroup">
        {RESOLVE_OUTCOMES.map((option, index) => {
          const selected = outcome === option.value;
          const label = resolvedOutcomePhrase(option.value, first) ?? option.label;
          return (
            <Pressable
              key={option.value}
              testID={`resolve-outcome-${option.value}`}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ checked: selected }}
              aria-checked={selected}
              // A second press clears the choice: the outcome stays optional.
              onPress={() => setOutcome(selected ? null : option.value)}
              style={[styles.row, index > 0 ? styles.rowDivider : null]}
            >
              <Text variant="body" style={styles.rowLabel}>
                {label}
              </Text>
              <View
                style={[styles.dot, selected ? styles.dotSelected : null]}
                importantForAccessibility="no-hide-descendants"
              >
                {selected ? <View style={styles.dotCore} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text variant="bodyStrong" tone="ink2" style={styles.label}>
        Note (only you)
      </Text>
      <TextInput
        accessibilityLabel="Note (only you)"
        multiline
        value={note}
        onChangeText={setNote}
        maxLength={2000}
        placeholderTextColor={theme.colors.ink4}
        style={styles.input}
      />

      <View style={styles.lockCard}>
        <Lock size={20} color={theme.colors.ink2} />
        <Text variant="body" tone="ink2" style={styles.lockText}>
          {resolveLockLine(traineeDisplayName)}
        </Text>
      </View>

      {errorMessage ? (
        <Text style={styles.error} accessibilityRole="alert">
          {errorMessage}
        </Text>
      ) : null}

      <Button
        label="Resolve"
        loading={acting}
        testID="resolve-confirm"
        onPress={() =>
          onConfirm({ outcome, note: note.trim() ? note.trim() : null })
        }
      />
    </BottomSheet>
  );
}

const useStyles = createThemedStyles((t) => ({
  header: { flexDirection: "row", alignItems: "flex-start", gap: t.spacing.md },
  headerText: { flex: 1, gap: t.spacing.xs },
  close: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 999,
    height: t.touchTarget,
    justifyContent: "center",
    width: t.touchTarget,
  },
  label: { marginTop: t.spacing.xs },
  rows: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line2,
    borderRadius: t.radii.card,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    alignSelf: "stretch",
    flexDirection: "row",
    gap: t.spacing.md,
    minHeight: t.touchTarget,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
  },
  rowDivider: { borderTopColor: t.colors.line2, borderTopWidth: 1 },
  rowLabel: { flex: 1 },
  dot: {
    alignItems: "center",
    borderColor: t.colors.ink3,
    borderRadius: 11,
    borderWidth: 2,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  dotSelected: { borderColor: t.colors.ink },
  dotCore: { backgroundColor: t.colors.ink, borderRadius: 6, height: 12, width: 12 },
  input: {
    ...t.text.body.style,
    color: t.colors.ink,
    backgroundColor: t.colors.card,
    borderColor: t.colors.line2,
    borderRadius: t.radii.input,
    borderWidth: 1,
    minHeight: 64,
    padding: t.spacing.md,
    textAlignVertical: "top",
  },
  lockCard: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: t.radii.card,
    flexDirection: "row",
    gap: t.spacing.md,
    padding: t.spacing.md,
  },
  lockText: { flex: 1 },
  error: { color: t.colors.crit, fontSize: 14 },
}));
