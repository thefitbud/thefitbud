import type { ReactNode } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { ChevronLeft, X } from "lucide-react-native";
import { fontFamilyBold, fontFamilySemiBold, spacing } from "@fitbud/ui-mobile";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import { BrandMark } from "../BrandMark";
import { Text } from "../Text";

export const TAB_BAR_INSET = 72;

type ScrollProps = {
  children: ReactNode;
  footer?: ReactNode;
  /** Leave room for trainee tab bar when shown as an overlay. */
  insetTabBar?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
};

export function M2ScrollBody({
  children,
  footer,
  insetTabBar = false,
}: ScrollProps) {
  const styles = useStyles();
  return (
    <View style={[styles.bodyRoot, insetTabBar && styles.bodyTabbed]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer ? <View style={styles.stickyFooter}>{footer}</View> : null}
    </View>
  );
}

export function M2Screen({
  children,
  footer,
  insetTabBar,
}: ScrollProps) {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.safe}>
      <M2ScrollBody footer={footer} insetTabBar={insetTabBar}>
        {children}
      </M2ScrollBody>
    </SafeAreaView>
  );
}

export function BrandRow() {
  const styles = useStyles();
  return (
    <View style={styles.brandRow} accessibilityLabel="FitBud">
      <BrandMark size={30} />
      <Text style={styles.brandWord}>FitBud</Text>
    </View>
  );
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

type AvatarProps = { name: string; size?: "md" | "lg"; style?: ViewStyle };

export function M2Avatar({ name, size = "md", style }: AvatarProps) {
  const styles = useStyles();
  const dim = size === "lg" ? 56 : 48;
  return (
    <View
      style={[
        styles.avatar,
        { width: dim, height: dim, borderRadius: dim / 2 },
        style,
      ]}
    >
      <Text style={[styles.avatarText, size === "lg" && styles.avatarTextLg]}>
        {initialsFromName(name)}
      </Text>
    </View>
  );
}

type TopNavProps = {
  backLabel?: string;
  title?: string;
  titleNode?: ReactNode;
  right?: ReactNode;
  onBack?: () => void;
};

export function M2TopNav({
  backLabel = "Back",
  title,
  titleNode,
  right,
  onBack,
}: TopNavProps) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.topNav}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={styles.backBtn}
        >
          <ChevronLeft size={24} color={theme.colors.brand} strokeWidth={2} />
          <Text style={styles.backLabel}>{backLabel}</Text>
        </Pressable>
      ) : (
        <View style={styles.backBtn} />
      )}
      <View style={styles.topCenter}>
        {titleNode ?? (title ? <Text style={styles.topTitle}>{title}</Text> : null)}
      </View>
      <View style={styles.topRight}>{right ?? null}</View>
    </View>
  );
}

export function M2CloseButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      onPress={onPress}
      style={styles.xBtn}
    >
      <X size={17} color={theme.colors.ink2} strokeWidth={2.4} />
    </Pressable>
  );
}

export function Progress5({ step }: { step: number }) {
  const styles = useStyles();
  return (
    <View style={styles.prog5}>
      {[0, 1, 2, 3, 4].map((index) => (
        <View
          key={index}
          style={[styles.progSeg, index < step ? styles.progSegOn : null]}
        />
      ))}
    </View>
  );
}

export function Dots4({ step }: { step: number }) {
  const styles = useStyles();
  return (
    <View style={styles.dots4}>
      {[0, 1, 2, 3].map((index) => (
        <View
          key={index}
          style={[
            styles.dot4,
            index === step ? styles.dot4On : null,
          ]}
        />
      ))}
    </View>
  );
}

export function SavedBadge({ label = "Saved" }: { label?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.savedBadge}>
      <Text style={styles.savedBadgeText}>{label}</Text>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  safe: {
    flex: 1,
    backgroundColor: t.colors.bgPlain,
  },
  bodyRoot: {
    flex: 1,
    backgroundColor: t.colors.bgPlain,
  },
  bodyTabbed: {
    paddingBottom: TAB_BAR_INSET,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
  },
  stickyFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.line,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: t.colors.glass,
  },
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  brandWord: {
    color: t.colors.ink,
    fontFamily: fontFamilyBold,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    justifyContent: "center",
  },
  avatarText: {
    color: t.colors.brand,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
    fontWeight: "700",
  },
  avatarTextLg: {
    fontSize: 19,
  },
  topNav: {
    alignItems: "center",
    flexDirection: "row",
    height: 48,
    marginHorizontal: -6,
  },
  backBtn: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 44,
    paddingLeft: 2,
    paddingRight: spacing.sm,
    width: "33%",
  },
  backLabel: {
    color: t.colors.brand,
    fontSize: 16,
    fontWeight: "600",
  },
  topCenter: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  topTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilyBold,
    fontSize: 17,
    fontWeight: "700",
  },
  topRight: {
    alignItems: "flex-end",
    justifyContent: "center",
    minHeight: 44,
    width: "33%",
  },
  xBtn: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  prog5: {
    flexDirection: "row",
    gap: 5,
    marginTop: spacing.sm,
  },
  progSeg: {
    backgroundColor: t.colors.fill2,
    borderRadius: 2,
    flex: 1,
    height: 4,
  },
  progSegOn: {
    backgroundColor: t.colors.brand,
  },
  dots4: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: 4,
  },
  dot4: {
    backgroundColor: t.colors.fill2,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  dot4On: {
    backgroundColor: t.colors.brand,
    width: 24,
  },
  savedBadge: {
    paddingRight: spacing.md,
  },
  savedBadgeText: {
    color: t.colors.ink3,
    fontSize: 13,
    fontWeight: "600",
  },
}));
