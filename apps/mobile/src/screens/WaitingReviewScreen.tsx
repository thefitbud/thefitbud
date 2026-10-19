import type { CoachingRelationship } from "@fitbud/contracts";
import { formatCivilDate, whatsappHref } from "@fitbud/core";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import {
  Bell,
  ChevronRight,
  Scale,
  Check,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Button } from "../components/Button";
import {
  BrandRow,
  Card2,
  M2Avatar,
  M2Screen,
} from "../components/m2";
import { WhatsAppGlyph } from "../components/m2/WhatsAppGlyph";

type TimelineStep = {
  label: string;
  detail?: string;
  state: "done" | "current" | "later";
};

function timelineFor(relationship: CoachingRelationship): TimelineStep[] {
  const status = relationship.onboardingStatus;
  const joined = formatCivilDate(relationship.startedAt.slice(0, 10));
  const intakeDone =
    status === "onboarding_submitted" ||
    status === "coaching_ready" ||
    status === "active";
  const reviewDone = status === "coaching_ready" || status === "active";
  const planReady = status === "active";

  return [
    { label: "Joined", detail: joined, state: "done" },
    {
      label: "Intake sent",
      detail: intakeDone ? joined : undefined,
      state: intakeDone ? "done" : "later",
    },
    {
      label: `${coachFirstName(relationship)} reviews your answers`,
      detail: reviewDone ? "Usually the next step" : "Usually the next step",
      state: reviewDone ? "done" : intakeDone ? "current" : "later",
    },
    {
      label: "Your plan is ready",
      state: planReady ? "done" : "later",
    },
  ];
}

function coachFirstName(relationship: CoachingRelationship): string {
  const raw = relationship.trainerDisplayName?.trim();
  if (!raw) return "Your coach";
  return raw.split(/\s+/)[0] ?? raw;
}

export function WaitingReviewScreen({
  relationship,
}: {
  relationship: CoachingRelationship;
}) {
  const { refreshSession, signOut } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const coach = coachFirstName(relationship);
  const coachFull = relationship.trainerDisplayName?.trim() ?? coach;
  const phoneE164 = relationship.trainerWhatsappE164 ?? null;
  const hasNumber = Boolean(phoneE164 && phoneE164.replace(/\D/g, "").length >= 10);
  const steps = timelineFor(relationship);
  const greetingName = "there";

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await refreshSession();
      setOffline(false);
    } catch {
      setError("Couldn't refresh. Pull to try again.");
      setOffline(true);
    } finally {
      setRefreshing(false);
    }
  }, [refreshSession]);

  useEffect(() => {
    const timer = setInterval(() => {
      void refreshSession().catch(() => {
        setOffline(true);
      });
    }, 20_000);
    return () => clearInterval(timer);
  }, [refreshSession]);

  return (
    <M2Screen>
      <BrandRow />
      <View style={styles.hero}>
        <Text style={styles.h1} accessibilityRole="header">
          Hi {greetingName}
        </Text>
        <Text style={styles.lead}>
          Your coach has your answers. Here&apos;s where things are.
        </Text>
      </View>

      {error ? <ErrorBanner message={error} /> : null}
      {offline ? (
        <Text style={styles.offline}>You&apos;re offline · we&apos;ll keep checking</Text>
      ) : null}

      <Card2 style={styles.statusCard}>
        <View style={styles.coachRow}>
          <M2Avatar name={coachFull} />
          <View style={styles.coachText}>
            <Text style={styles.coachTitle}>{coach} is preparing your plan</Text>
            <Text style={styles.coachSub}>
              You&apos;ll get a notification when it&apos;s ready
            </Text>
          </View>
        </View>
        <View style={styles.timeline}>
          {steps.map((step, index) => (
            <View key={step.label}>
              <View style={styles.chkRow}>
                <View
                  style={[
                    styles.chkIcon,
                    step.state === "done" && styles.chkIconDone,
                    step.state === "current" && styles.chkIconCurrent,
                    step.state === "later" && styles.chkIconLater,
                  ]}
                >
                  {step.state === "done" ? (
                    <Check size={15} color={colors.white} strokeWidth={3} />
                  ) : null}
                </View>
                <View>
                  <Text
                    style={[
                      styles.chkLabel,
                      step.state === "later" && styles.chkLabelLater,
                    ]}
                  >
                    {step.label}
                  </Text>
                  {step.detail ? (
                    <Text style={styles.chkDetail}>{step.detail}</Text>
                  ) : null}
                </View>
              </View>
              {index < steps.length - 1 ? <View style={styles.chkLine} /> : null}
            </View>
          ))}
        </View>
      </Card2>

      <Text style={styles.section}>Meanwhile</Text>
      <Card2 style={styles.listCard}>
        <Pressable accessibilityRole="button" style={styles.lrow}>
          <View style={styles.tile}>
            <Bell size={19} color={colors.indigo} strokeWidth={1.75} />
          </View>
          <View style={styles.lrowText}>
            <Text style={styles.lrowTitle}>Set up reminders</Text>
            <Text style={styles.lrowSub}>
              Two minutes, so logging is easy later
            </Text>
          </View>
          <ChevronRight size={18} color={colors.midGrey} />
        </Pressable>
        <View style={styles.rowDivider} />
        <Pressable accessibilityRole="button" style={styles.lrow}>
          <View style={styles.tile}>
            <Scale size={19} color={colors.indigo} strokeWidth={1.75} />
          </View>
          <View style={styles.lrowText}>
            <Text style={styles.lrowTitle}>Add your starting weight</Text>
            <Text style={styles.lrowSub}>Optional</Text>
          </View>
          <ChevronRight size={18} color={colors.midGrey} />
        </Pressable>
      </Card2>

      <Button
        label={`Message ${coach} on WhatsApp`}
        variant="whatsapp"
        disabled={!hasNumber}
        onPress={() => {
          if (!hasNumber) return;
          const text = `Hi ${coach}, I've filled my FitBud intake and I'm ready when you are.`;
          void Linking.openURL(whatsappHref({ phoneE164, draftText: text }));
        }}
      />
      <View style={styles.waNoteRow}>
        <WhatsAppGlyph size={18} />
        <Text style={styles.waNote}>
          Opens WhatsApp with a message ready. You press Send.
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => void refresh()}
        style={styles.refreshHit}
      >
        <Text style={styles.refreshLabel}>
          {refreshing ? "Checking…" : "Pull to refresh for updates"}
        </Text>
      </Pressable>

      <Button label="Sign out" variant="tertiary" onPress={signOut} />
    </M2Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: spacing.md,
  },
  h1: {
    color: colors.deepNavy,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.4,
    lineHeight: 36,
  },
  lead: {
    color: colors.midGrey,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 4,
  },
  offline: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: spacing.md,
  },
  statusCard: {
    marginTop: spacing.lg,
  },
  coachRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  coachText: {
    flex: 1,
  },
  coachTitle: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
  },
  coachSub: {
    color: colors.midGrey,
    fontSize: 14,
    marginTop: 2,
  },
  timeline: {
    marginTop: 14,
  },
  chkRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 48,
  },
  chkIcon: {
    alignItems: "center",
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  chkIconDone: {
    backgroundColor: colors.deepNavy,
  },
  chkIconCurrent: {
    borderColor: colors.indigo,
    borderWidth: 2,
  },
  chkIconLater: {
    borderColor: "#D5D6DE",
    borderStyle: "dashed",
    borderWidth: 2,
  },
  chkLabel: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
  chkLabelLater: {
    color: colors.midGrey,
    fontWeight: "500",
  },
  chkDetail: {
    color: colors.midGrey,
    fontSize: 13,
  },
  chkLine: {
    backgroundColor: "#E7E9F2",
    height: 10,
    marginLeft: 13,
    width: 2,
  },
  section: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
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
  rowDivider: {
    backgroundColor: "#E7E9F2",
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.lg + 36 + spacing.md,
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
  waNoteRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: spacing.md,
  },
  waNote: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 17,
    textAlign: "center",
  },
  refreshHit: {
    alignItems: "center",
    marginTop: spacing.lg,
    minHeight: 44,
    justifyContent: "center",
  },
  refreshLabel: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "600",
  },
});
