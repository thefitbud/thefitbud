import { useEffect, useState } from "react";
import { Pressable, Switch, TextInput, View } from "react-native";
import type { CreateTrainerNoteRequest } from "@fitbud/contracts";
import { BottomSheet } from "../../components/BottomSheet";
import { Text } from "../../components/Text";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../../providers/ThemeProvider";
import {
  NOTE_MAX_LENGTH,
  firstNameOf,
  notePrivateLine,
} from "./exceptionSheetContent";

type TrainerNoteVisibility = NonNullable<CreateTrainerNoteRequest["visibility"]>;

export type NoteSaveInput = { body: string; visibility: TrainerNoteVisibility };

type Props = {
  visible: boolean;
  traineeDisplayName: string;
  /** Kept for callers; the TM-04k composer shows no "From …" preview. */
  trainerDisplayName?: string | null;
  acting?: boolean;
  /** Static, curated error text shown inside the sheet. */
  errorMessage?: string | null;
  onDismiss: () => void;
  onSave: (input: NoteSaveInput) => void;
};

/**
 * TM-04k: note composer with Cancel and Save in the header. Uses the existing
 * trainer-note contract: "Show on {First}'s Today" maps to `visibility`
 * ("client" shows it on their Today, "private" keeps it to the trainer).
 * Defaults to shown, as in the mock.
 */
export function NoteSheet(props: Props) {
  return (
    <ThemeScope scheme="system" drivesSystemBars={false}>
      <NoteSheetBody {...props} />
    </ThemeScope>
  );
}

function NoteSheetBody({
  visible,
  traineeDisplayName,
  acting = false,
  errorMessage,
  onDismiss,
  onSave,
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const [body, setBody] = useState("");
  const [shared, setShared] = useState(true);

  useEffect(() => {
    if (visible) {
      setBody("");
      setShared(true);
    }
  }, [visible]);

  const first = firstNameOf(traineeDisplayName);
  const trimmed = body.trim();
  const canSave = Boolean(trimmed) && !acting;
  const toggleLabel = first ? `Show on ${first}'s Today` : "Show on their Today";

  return (
    <BottomSheet visible={visible} headerless onDismiss={onDismiss}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={onDismiss}
          style={styles.headerBtn}
        >
          <Text variant="body">Cancel</Text>
        </Pressable>
        <Text variant="headline" accessibilityRole="header" style={styles.title} numberOfLines={1}>
          {first ? `Note for ${first}` : "Note"}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save"
          accessibilityState={{ disabled: !canSave, busy: acting }}
          disabled={!canSave}
          onPress={() =>
            onSave({ body: trimmed, visibility: shared ? "client" : "private" })
          }
          style={[styles.headerBtn, styles.headerBtnEnd]}
          testID="note-save"
        >
          <Text variant="bodyStrong" tone={canSave ? "ink" : "ink4"}>
            Save
          </Text>
        </Pressable>
      </View>

      <TextInput
        accessibilityLabel="Note"
        multiline
        autoFocus
        value={body}
        onChangeText={setBody}
        maxLength={NOTE_MAX_LENGTH}
        placeholderTextColor={theme.colors.ink4}
        style={styles.input}
      />

      <View style={styles.shareRow}>
        <View style={styles.shareText}>
          <Text variant="body">{toggleLabel}</Text>
          <Text variant="subhead">
            {notePrivateLine()}
          </Text>
        </View>
        <Switch
          accessibilityLabel={toggleLabel}
          value={shared}
          onValueChange={setShared}
          trackColor={{ true: theme.colors.done, false: theme.colors.fill2 }}
          thumbColor="#FFFFFF"
        />
      </View>

      {errorMessage ? (
        <Text style={styles.error} accessibilityRole="alert">
          {errorMessage}
        </Text>
      ) : null}
    </BottomSheet>
  );
}

const useStyles = createThemedStyles((t) => ({
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: t.spacing.sm,
  },
  headerBtn: {
    justifyContent: "center",
    minHeight: t.touchTarget,
    minWidth: 64,
  },
  headerBtnEnd: { alignItems: "flex-end" },
  title: { flex: 1, textAlign: "center" },
  input: {
    ...t.text.body.style,
    color: t.colors.ink,
    backgroundColor: t.colors.card,
    borderColor: t.colors.ink,
    borderRadius: t.radii.input,
    borderWidth: 2,
    minHeight: 120,
    padding: t.spacing.md,
    textAlignVertical: "top",
  },
  shareRow: { alignItems: "center", flexDirection: "row", gap: t.spacing.md },
  shareText: { flex: 1, gap: 2 },
  error: { color: t.colors.crit, fontSize: 14 },
}));
