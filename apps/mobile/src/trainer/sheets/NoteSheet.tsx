import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, TextInput, View } from "react-native";
import { Eye, X } from "lucide-react-native";
import type { CreateTrainerNoteRequest } from "@fitbud/contracts";

type TrainerNoteVisibility = NonNullable<CreateTrainerNoteRequest["visibility"]>;
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
  NOTE_MAX_LENGTH,
  firstNameOf,
  noteAppearsLine,
  noteCounterLabel,
  notePrivateLine,
  noteVisibleLine,
} from "./exceptionSheetContent";

export type NoteSaveInput = { body: string; visibility: TrainerNoteVisibility };

type Props = {
  visible: boolean;
  traineeDisplayName: string;
  trainerDisplayName?: string | null;
  acting?: boolean;
  /** Static, curated error text shown inside the sheet. */
  errorMessage?: string | null;
  onDismiss: () => void;
  onSave: (input: NoteSaveInput) => void;
};

/**
 * Frame 36: note composer. Uses the existing trainer-note contract: the
 * toggle maps to `visibility` ("client" shares it and notifies the client,
 * "private" keeps it to the trainer). Defaults to shared, as in the frame.
 */
export function NoteSheet({
  visible,
  traineeDisplayName,
  trainerDisplayName,
  acting = false,
  errorMessage,
  onDismiss,
  onSave,
}: Props) {
  const [body, setBody] = useState("");
  const [shared, setShared] = useState(true);

  useEffect(() => {
    if (visible) {
      setBody("");
      setShared(true);
    }
  }, [visible]);

  const name = firstNameOf(traineeDisplayName) || "client";
  const trimmed = body.trim();

  return (
    <BottomSheet visible={visible} headerless onDismiss={onDismiss}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">
            {`Note about ${name}`}
          </Text>
          <Text style={styles.subtitle}>Private unless you share it</Text>
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

      <TextInput
        accessibilityLabel="Note"
        multiline
        autoFocus
        value={body}
        onChangeText={setBody}
        maxLength={NOTE_MAX_LENGTH}
        placeholderTextColor={colors.midGrey}
        style={styles.input}
      />
      <Text style={styles.counter}>{noteCounterLabel(body.length)}</Text>

      <View style={styles.shareRow}>
        <View style={styles.shareText}>
          <Text style={styles.shareTitle}>{`Visible to ${name}`}</Text>
          <Text style={styles.subtitle}>
            {shared ? noteVisibleLine(traineeDisplayName) : notePrivateLine()}
          </Text>
        </View>
        <Switch
          accessibilityLabel={`Visible to ${name}`}
          value={shared}
          onValueChange={setShared}
          trackColor={{ true: colors.indigo }}
          thumbColor={colors.white}
        />
      </View>

      {shared ? (
        <View style={styles.appearsRow}>
          <Text style={styles.subtitle}>How it appears</Text>
          <View style={styles.appears}>
            <Eye size={18} color={colors.indigo} />
            <Text style={styles.appearsText}>
              {noteAppearsLine(trainerDisplayName)}
            </Text>
          </View>
        </View>
      ) : null}

      {errorMessage ? (
        <Text style={styles.error} accessibilityRole="alert">
          {errorMessage}
        </Text>
      ) : null}

      <Button
        label="Save note"
        loading={acting}
        disabled={!trimmed}
        onPress={() =>
          onSave({ body: trimmed, visibility: shared ? "client" : "private" })
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
  input: {
    ...defaultTextStyle,
    borderColor: colors.indigo,
    borderRadius: radii.card,
    borderWidth: 2,
    minHeight: 120,
    padding: spacing.md,
    textAlignVertical: "top",
  },
  counter: { color: colors.midGrey, fontSize: 14, textAlign: "right" },
  shareRow: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  shareText: { flex: 1, gap: spacing.xs },
  shareTitle: {
    color: colors.deepNavy,
    fontFamily: fontFamilyMedium,
    fontSize: 18,
    fontWeight: "600",
  },
  appearsRow: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  appears: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderRadius: 999,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  appearsText: { color: colors.indigo, fontSize: 15 },
  error: { color: colors.error, fontSize: 14 },
});
