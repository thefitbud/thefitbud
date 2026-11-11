import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { MessageCircle, X } from "lucide-react-native";
import type { ExceptionDetail } from "@fitbud/contracts";
import {
  colors,
  fontFamilyMedium,
  radii,
  semanticColors,
  spacing,
  touchTargetMin,
} from "@fitbud/ui-mobile";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { Text } from "../../components/Text";
import { openContextualWhatsApp } from "../whatsapp";
import {
  firstNameOf,
  nudgeDraftText,
  nudgeSheetSubtitle,
} from "./exceptionSheetContent";

type Props = {
  visible: boolean;
  detail: Pick<ExceptionDetail, "type" | "details">;
  traineeDisplayName: string;
  clientWhatsappE164: string | null;
  onDismiss: () => void;
  /** Called after WhatsApp was handed the prefill; Z10-7 hooks logging here. */
  onOpened?: () => void;
};

/**
 * Frame 34: WhatsApp prefill preview. FitBud never sends: it opens wa.me and
 * the trainer presses Send in WhatsApp.
 */
export function NudgeSheet({
  visible,
  detail,
  traineeDisplayName,
  clientWhatsappE164,
  onDismiss,
  onOpened,
}: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (visible) setFailed(false);
  }, [visible]);
  const name = firstNameOf(traineeDisplayName);
  const draft = nudgeDraftText(detail, traineeDisplayName);

  async function open() {
    setFailed(false);
    const ok = await openContextualWhatsApp({
      phoneE164: clientWhatsappE164,
      draftText: draft,
    });
    if (ok) {
      onOpened?.();
      onDismiss();
    } else {
      setFailed(true);
    }
  }

  return (
    <BottomSheet visible={visible} headerless onDismiss={onDismiss}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">
            {name ? `Nudge ${name} on WhatsApp` : "Nudge on WhatsApp"}
          </Text>
          <Text style={styles.subtitle}>{nudgeSheetSubtitle(detail)}</Text>
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

      <Text style={styles.label}>Message preview · you can edit it in WhatsApp</Text>
      <View style={styles.preview}>
        <Text style={styles.previewText}>{draft}</Text>
      </View>

      {failed ? (
        <Text style={styles.error} accessibilityRole="alert">
          WhatsApp could not be opened on this device.
        </Text>
      ) : null}

      <Button
        label="Open WhatsApp"
        icon={<MessageCircle size={22} color="#25D366" />}
        onPress={() => {
          void open();
        }}
      />
      <Text style={styles.footnote}>
        You press Send in WhatsApp.
      </Text>
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
  preview: {
    backgroundColor: semanticColors.positive.fill,
    borderColor: `${semanticColors.positive.text}33`,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing.lg,
  },
  previewText: { color: semanticColors.positive.text, fontSize: 17, lineHeight: 25 },
  error: { color: colors.error, fontSize: 14 },
  footnote: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
