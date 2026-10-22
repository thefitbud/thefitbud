import { Pressable, StyleSheet, View } from "react-native";
import { CalendarOff, ChevronRight, Moon } from "lucide-react-native";
import { Text } from "../components/Text";
import { colors, spacing } from "@fitbud/ui-mobile";
import { Button } from "../components/Button";
import { Card2, M2ScrollBody, M2TopNav } from "../components/m2";

export type UnavailableReplacement = {
  title: string;
  subtitle: string;
  onPress?: () => void;
};

type Props = {
  reason?: string;
  updatedOnLabel?: string;
  replacement?: UnavailableReplacement | null;
  onGoToday?: () => void;
  onBack?: () => void;
  insetTabBar?: boolean;
};

export function DeepLinkUnavailableScreen({
  reason,
  updatedOnLabel,
  replacement,
  onGoToday,
  onBack,
  insetTabBar = false,
}: Props) {
  const goToday = onGoToday ?? onBack ?? (() => undefined);
  const body =
    reason ??
    "It may have been replaced by a plan update, coaching ended, or this isn't your account.";

  const footer = (
    <Button label="Go to Today" onPress={goToday} />
  );

  return (
    <View style={styles.root}>
      <M2ScrollBody footer={footer} insetTabBar={insetTabBar}>
        <M2TopNav onBack={onBack ?? goToday} />
        <View style={styles.hero}>
          <View style={styles.iconTile}>
            <CalendarOff size={34} color={colors.indigo} strokeWidth={1.75} />
          </View>
          <Text style={styles.h1} accessibilityRole="header">
            This item isn&apos;t available anymore
          </Text>
          <Text style={styles.lead}>
            {updatedOnLabel
              ? `${body.replace(/\.$/, "")} on ${updatedOnLabel}.`
              : body}
          </Text>
        </View>

        {replacement ? (
          <>
            <Text style={styles.section}>Tonight instead</Text>
            <Card2 style={styles.listCard}>
              <Pressable
                accessibilityRole="button"
                onPress={replacement.onPress}
                style={styles.lrow}
              >
                <View style={styles.tile}>
                  <Moon size={19} color={colors.indigo} strokeWidth={1.75} />
                </View>
                <View style={styles.lrowText}>
                  <Text style={styles.lrowTitle}>{replacement.title}</Text>
                  <Text style={styles.lrowSub}>{replacement.subtitle}</Text>
                </View>
                <ChevronRight size={18} color={colors.midGrey} />
              </Pressable>
            </Card2>
          </>
        ) : null}
      </M2ScrollBody>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.white,
    flex: 1,
  },
  hero: {
    alignItems: "center",
    marginTop: 70,
    paddingHorizontal: 12,
  },
  iconTile: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderRadius: 24,
    height: 72,
    justifyContent: "center",
    width: 72,
  },
  h1: {
    color: colors.deepNavy,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.3,
    lineHeight: 32,
    marginTop: 20,
    textAlign: "center",
  },
  lead: {
    color: colors.midGrey,
    fontSize: 16,
    lineHeight: 23,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  section: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: spacing.sm,
    marginTop: 32,
    paddingHorizontal: 4,
  },
  listCard: {
    padding: 0,
  },
  lrow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  tile: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderRadius: 11,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  lrowText: {
    flex: 1,
  },
  lrowTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
  lrowSub: {
    color: colors.midGrey,
    fontSize: 14,
  },
});
