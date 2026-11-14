import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "./Text";
import { spacing } from "@fitbud/ui-mobile";
import { createThemedStyles } from "../providers/ThemeProvider";

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
  const styles = useStyles();
  const isWeb = Platform.OS === "web";
  const isIos = Platform.OS === "ios";
  return (
    <Modal
      animationType="slide"
      transparent
      statusBarTranslucent={Platform.OS === "android"}
      visible={visible}
      onRequestClose={onDismiss}
    >
      {/* iOS does not resize a transparent modal for the keyboard, so pad the
          bottom-anchored sheet by the keyboard height (ate out, portion, resolve and note sheets). */}
      <KeyboardAvoidingView
        accessibilityViewIsModal
        behavior={isIos ? "padding" : undefined}
        style={[styles.root, !isWeb ? styles.rootNative : null]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss sheet"
          style={styles.scrim}
          onPress={onDismiss}
        />
        <View style={[styles.sheet, !isWeb ? styles.sheetNative : null]}>
          <View style={styles.handle} accessibilityElementsHidden />
          {!headerless && title ? (
            <Text variant="title" style={styles.title}>{title}</Text>
          ) : null}
          {!headerless && subtitle ? (
            <Text variant="subhead" style={styles.subtitle}>{subtitle}</Text>
          ) : null}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Kit `.sheet`: card over the scrim, 22 pt top corners, a fill2 grab handle. */
const useStyles = createThemedStyles((t) => ({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  rootNative: {
    justifyContent: "flex-end",
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: t.colors.scrim,
  },
  sheet: {
    backgroundColor: t.colors.card,
    borderTopLeftRadius: t.radii.sheet,
    borderTopRightRadius: t.radii.sheet,
    // Dark has no shadows: depth is the card on the scrim plus a 1 px edge (DESIGN-SYSTEM-v3 §4).
    borderTopWidth: t.scheme === "dark" ? 1 : 0,
    borderColor: t.colors.edge,
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
    backgroundColor: t.colors.fill2,
    borderRadius: 3,
    height: 5,
    marginBottom: 10,
    width: 36,
  },
  title: {},
  subtitle: {
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
}));
