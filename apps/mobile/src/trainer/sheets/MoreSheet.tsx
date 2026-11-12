import { Modal, Pressable, StyleSheet, View } from "react-native";
import type { ExceptionDetail } from "@fitbud/contracts";
import { colors, radii, spacing, touchTargetMin } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { formatPersonName } from "@fitbud/core";
import { nudgeSheetSubtitle } from "./exceptionSheetContent";

type Props = {
  visible: boolean;
  detail: Pick<ExceptionDetail, "type" | "details">;
  traineeDisplayName: string;
  onAddNote: () => void;
  onMessageOnWhatsApp: () => void;
  onDismiss: () => void;
};

/**
 * Frame 35: the header ⋯ action sheet. Two actions and Cancel. Choosing one
 * closes the sheet first; the parent opens the next sheet.
 */
export function MoreSheet({
  visible,
  detail,
  traineeDisplayName,
  onAddNote,
  onMessageOnWhatsApp,
  onDismiss,
}: Props) {
  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onDismiss}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss menu"
          style={styles.scrim}
          onPress={onDismiss}
        />
        <View style={styles.group}>
          <View style={styles.head}>
            <Text style={styles.headName}>{formatPersonName(traineeDisplayName)}</Text>
            <Text style={styles.headSub}>{nudgeSheetSubtitle(detail)}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onAddNote}
            style={[styles.row, styles.rowDivider]}
          >
            <Text style={styles.action}>Add note</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onMessageOnWhatsApp}
            style={[styles.row, styles.rowDivider]}
          >
            <Text style={styles.action}>Message on WhatsApp</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onDismiss}
          style={[styles.group, styles.cancel]}
        >
          <Text style={[styles.action, styles.cancelText]}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: "flex-end",
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 17, 21, 0.45)",
  },
  group: {
    backgroundColor: colors.background,
    borderRadius: radii.card,
    overflow: "hidden",
  },
  head: {
    alignItems: "center",
    gap: 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headName: { color: colors.deepNavy, fontSize: 14, fontWeight: "600" },
  headSub: { color: colors.midGrey, fontSize: 13, textAlign: "center" },
  row: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
  },
  rowDivider: { borderTopColor: colors.lightGrey, borderTopWidth: 1 },
  action: { color: colors.indigo, fontSize: 20 },
  cancel: {
    alignItems: "center",
    backgroundColor: colors.white,
    justifyContent: "center",
    minHeight: Math.max(56, touchTargetMin),
  },
  cancelText: { fontWeight: "600" },
});
