import { useState, type ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { Text } from "../../components/Text";
import { useHardwareBack } from "../../lib/useHardwareBack";
import { createThemedStyles } from "../../providers/ThemeProvider";

/**
 * Z14-18: the one back for a client log screen. The on-screen Back and the
 * hardware back both call `requestBack`: with nothing typed it goes back; with
 * unsaved input it asks "Discard this log?" first (Discard / Keep editing).
 * `stepBack` lets a screen with an inner view (the meal log's "something
 * different") step out of that view first; return true when it did.
 */
export function useDiscardGuard(
  dirty: boolean,
  onBack: () => void,
  stepBack?: () => boolean,
): { requestBack: () => void; dialog: ReactNode } {
  const [asking, setAsking] = useState(false);
  const requestBack = () => {
    if (stepBack?.()) return;
    if (dirty) setAsking(true);
    else onBack();
  };
  useHardwareBack(() => {
    if (asking) {
      setAsking(false); // The question is a sheet: back closes only it.
      return true;
    }
    requestBack();
    return true;
  });
  const dialog = (
    <DiscardDialog
      title="Discard this log?"
      body="What you entered won’t be saved."
      keepLabel="Keep editing"
      visible={asking}
      onKeep={() => setAsking(false)}
      onDiscard={() => {
        setAsking(false);
        onBack();
      }}
    />
  );
  return { requestBack, dialog };
}

/** The shared Discard / Keep question (a sheet: back closes only it). */
export function DiscardDialog({
  title,
  body,
  keepLabel,
  visible,
  onKeep,
  onDiscard,
}: {
  title: string;
  body: string;
  keepLabel: string;
  visible: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  const styles = useStyles();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onKeep}
    >
      <View style={styles.scrim}>
        <View accessibilityViewIsModal style={styles.card}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.body}>{body}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onKeep}
            style={[styles.btn, styles.keep]}
          >
            <Text style={styles.keepText}>{keepLabel}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onDiscard}
            style={styles.btn}
          >
            <Text style={styles.discardText}>Discard</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createThemedStyles((t) => ({
  scrim: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: t.colors.card,
    borderRadius: 16,
    gap: 8,
    padding: 20,
    width: "100%",
  },
  title: { color: t.colors.ink, fontSize: 18, fontWeight: "600" },
  body: { color: t.colors.ink3, fontSize: 15, lineHeight: 21, marginBottom: 8 },
  btn: { alignItems: "center", justifyContent: "center", minHeight: 48 },
  keep: { backgroundColor: t.colors.brand, borderRadius: 12 },
  keepText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  discardText: { color: t.colors.ink, fontSize: 16, fontWeight: "600" },
}));
