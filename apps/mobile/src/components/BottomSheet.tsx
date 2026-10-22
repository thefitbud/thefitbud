import type { ReactNode } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { brand, surface } from "@fitbud/tokens";
import { colors, radii, spacing } from "@fitbud/ui-mobile";

const SHEET_RADIUS = radii.card;

type Props = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  /** When true, only the grab handle and children are shown (child owns the title). */
  headerless?: boolean;
  onDismiss: () => void;
  children: ReactNode;
};

export function BottomSheet({
  visible,
  title,
  subtitle,
  headerless = false,
  onDismiss,
  children,
}: Props) {
  const isWeb = Platform.OS === "web";
  const isIos = Platform.OS === "ios";
  return (
    <Modal
      animationType="slide"
      transparent={isWeb || Platform.OS === "android"}
      presentationStyle={isIos ? "pageSheet" : undefined}
      statusBarTranslucent={Platform.OS === "android"}
      visible={visible}
      onRequestClose={onDismiss}
    >
      <View style={[styles.root, !isWeb ? styles.rootNative : null]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss sheet"
          style={styles.scrim}
          onPress={onDismiss}
        />
        <View style={[styles.sheet, !isWeb ? styles.sheetNative : null]}>
          <View style={styles.handle} accessibilityElementsHidden />
          {!headerless && title ? (
            <Text style={styles.title}>{title}</Text>
          ) : null}
          {!headerless && subtitle ? (
            <Text style={styles.subtitle}>{subtitle}</Text>
          ) : null}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  rootNative: {
    justifyContent: "flex-end",
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 17, 21, 0.45)",
  },
  sheet: {
    backgroundColor: surface.card,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    maxHeight: "92%",
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sheetNative: {
    maxHeight: "88%",
    minHeight: "42%",
  },
  handle: {
    alignSelf: "center",
    backgroundColor: colors.lightGrey,
    borderRadius: 999,
    height: 4,
    marginBottom: spacing.md,
    width: 40,
  },
  title: {
    color: brand.deepNavy,
    fontSize: 20,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
});
