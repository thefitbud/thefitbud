import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, TextInput, View } from "react-native";
import { Lock, Eye } from "lucide-react-native";
import type { CreateTrainerNoteRequest } from "@fitbud/contracts";
import { BottomSheet } from "../../components/BottomSheet";
import { Text } from "../../components/Text";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../../providers/ThemeProvider";
import { DiscardDialog } from "../clientlog/useDiscardGuard";
import { NOTE_MAX_LENGTH, firstNameOf } from "./exceptionSheetContent";

type TrainerNoteVisibility = NonNullable<CreateTrainerNoteRequest["visibility"]>;

export type NoteSaveInput = { body: string; visibility: TrainerNoteVisibility };

type Props = {
  visible: boolean;
  traineeDisplayName: string;
  /** Kept for callers; the TM-04k composer shows no "From …" preview. */
  trainerDisplayName?: string | null;
  /** For the consequence line "{He/She/They} gets one notification." Defaults to "They". */
  subject?: "He" | "She" | "They";
  acting?: boolean;
  /** Static, curated error text shown inside the sheet. */
  errorMessage?: string | null;
  onDismiss: () => void;
  onSave: (input: NoteSaveInput) => void;
};

/** TM-04k2/3: the two choices and the one line that says what each means. */
export function noteVisibilityLabels(first: string): {
  only: string;
  also: string;
} {
  return { only: "Only me", also: first ? `${first} too` : "Them too" };
}

export function noteConsequenceLine(
  visibility: TrainerNoteVisibility,
  first: string,
  subject: "He" | "She" | "They" = "They",
): string {
  if (visibility === "private") return "Only you can see this note.";
  const today = first ? `${first}'s Today` : "their Today";
  return `Shows on ${today}. ${subject} gets one notification.`;
}

/**
 * TM-04k (Z14-24): one note composer for every Add note. Cancel and Save in
 * the header; a two-option control, "Only me" (default, `visibility` private)
 * or "{first} too" (client); Cancel, swipe down, tapping outside and Android
 * back all ask "Discard this note?" only when something was typed.
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
  subject = "They",
  acting = false,
  errorMessage,
  onDismiss,
  onSave,
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const [body, setBody] = useState("");
  const [shared, setShared] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (visible) {
      setBody("");
      setShared(false);
      setAsking(false);
    }
  }, [visible]);

  const first = firstNameOf(traineeDisplayName);
  const trimmed = body.trim();
  const canSave = Boolean(trimmed) && !acting;
  const visibility: TrainerNoteVisibility = shared ? "client" : "private";
  const labels = noteVisibilityLabels(first);

  // Every way out of the sheet comes here.
  const requestClose = () => {
    if (acting) return;
    if (trimmed) setAsking(true);
    else onDismiss();
  };
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;

  // Swipe down on the header closes it (the BottomSheet has no drag of its own).
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
        onPanResponderRelease: (_e, g) => {
          if (g.dy > 60 || g.vy > 0.6) closeRef.current();
        },
      }),
    [],
  );

  return (
    <BottomSheet visible={visible} headerless onDismiss={requestClose}>
      <View style={styles.header} {...pan.panHandlers}>
        <Pressable
          accessibilityRole="button"
          onPress={requestClose}
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
          onPress={() => onSave({ body: trimmed, visibility })}
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
        placeholder={first ? `Write a note for ${first}` : "Write a note"}
        multiline
        autoFocus
        value={body}
        onChangeText={setBody}
        maxLength={NOTE_MAX_LENGTH}
        placeholderTextColor={theme.colors.ink4}
        style={styles.input}
      />

      <View style={styles.who}>
        <Text variant="caption" tone="ink3" accessibilityRole="header">
          WHO CAN SEE IT
        </Text>
        <View accessibilityRole="radiogroup" style={styles.seg}>
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel={labels.only}
            accessibilityState={{ checked: !shared }}
            onPress={() => setShared(false)}
            style={[styles.segment, !shared ? styles.segmentOn : null]}
            testID="note-vis-private"
          >
            <Lock color={theme.colors.ink} size={14} strokeWidth={2.2} />
            <Text style={styles.segText}>{labels.only}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel={labels.also}
            accessibilityState={{ checked: shared }}
            onPress={() => setShared(true)}
            style={[styles.segment, shared ? styles.segmentOn : null]}
            testID="note-vis-client"
          >
            <Eye color={theme.colors.ink} size={14} strokeWidth={2.2} />
            <Text style={styles.segText}>{labels.also}</Text>
          </Pressable>
        </View>
        <Text variant="subhead" testID="note-consequence">
          {noteConsequenceLine(visibility, first, subject)}
        </Text>
      </View>

      {errorMessage ? (
        <Text style={styles.error} accessibilityRole="alert">
          {errorMessage}
        </Text>
      ) : null}

      <DiscardDialog
        title="Discard this note?"
        body={first ? `Your note for ${first} won’t be saved.` : "Your note won’t be saved."}
        keepLabel="Keep writing"
        visible={asking}
        onKeep={() => setAsking(false)}
        onDiscard={() => {
          setAsking(false);
          setBody("");
          onDismiss();
        }}
      />
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
  who: { gap: t.spacing.sm },
  seg: {
    backgroundColor: t.colors.fill,
    borderRadius: t.radii.segment,
    flexDirection: "row",
    gap: 2,
    padding: 2,
  },
  segment: {
    alignItems: "center",
    borderRadius: t.radii.segment - 2,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 44,
  },
  segmentOn: { backgroundColor: t.colors.card },
  segText: { color: t.colors.ink, fontSize: 14, fontWeight: "600" },
  error: { color: t.colors.crit, fontSize: 14 },
}));
