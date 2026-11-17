import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Pressable, RefreshControl, SafeAreaView, ScrollView, View } from "react-native";
import {
  Bell,
  ChevronRight,
  CircleUserRound,
  ClipboardCheck,
  Footprints,
  Hourglass,
  MessageCircle,
} from "lucide-react-native";
import type { CoachingRelationship } from "@fitbud/contracts";
import { formatCivilDate, formatLocalDate, whatsappHref, zonedDateTimeFormat } from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { BottomSheet } from "../components/BottomSheet";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { Text } from "../components/Text";
import { isStepsEnabled } from "../lib/config";
import { localDateInTimezone } from "../lib/dates";
import { reportError } from "../lib/reportError";
import { useConfig } from "../providers/ConfigProvider";
import { ThemeScope, createThemedStyles, useTheme } from "../providers/ThemeProvider";
import { ReminderSettingsScreen } from "../trainee/settings/ReminderSettingsScreen";
import { QuietHoursScreen } from "../trainee/settings/QuietHoursScreen";
import { StepsSetupScreen } from "../trainee/steps/StepsSetupScreen";

function coachFirstName(relationship: CoachingRelationship): string {
  const raw = relationship.trainerDisplayName?.trim();
  if (!raw) return "Your coach";
  return raw.split(/\s+/)[0] ?? raw;
}

/** "Fri 13 Nov, 8:12 pm" in the trainee's zone; null for a bad timestamp. */
export function sentAtLabel(iso: string | null, zone: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const day = formatCivilDate(formatLocalDate(date, zone));
  try {
    const time = zonedDateTimeFormat("en-IN", {
      timeZone: zone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .format(date)
      .replace(/\s?(AM|PM)$/i, (m) => ` ${m.trim().toLowerCase()}`);
    return `${day}, ${time}`;
  } catch (err) {
    reportError("WaitingReview.sentAt", err);
    return day;
  }
}

type Detail = "reminders" | "quiet_hours" | "steps" | null;

/**
 * TR-04: intake sent, the coach builds the plan. Reminders and Steps can be
 * set up while waiting; sign-out sits behind the account button (the old
 * visible Sign out, pull-to-refresh hint and WhatsApp-green button are gone,
 * Z12-19). The app checks for the plan every 20 seconds and on pull.
 */
function WaitingReviewScreenBody({ relationship }: { relationship: CoachingRelationship }) {
  const theme = useTheme();
  const styles = useStyles();
  const { refreshSession, signOut, api, me } = useAuth();
  const { config } = useConfig();
  const zone = me?.timezone || "Asia/Kolkata";
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [detail, setDetail] = useState<Detail>(null);
  const coach = coachFirstName(relationship);
  const phoneE164 = relationship.trainerWhatsappE164 ?? null;
  const hasNumber = Boolean(phoneE164 && phoneE164.replace(/\D/g, "").length >= 10);
  const [intakeSubmittedAt, setIntakeSubmittedAt] = useState<string | null>(null);
  const [greetingName, setGreetingName] = useState("there");

  useEffect(() => {
    void api
      .getTraineeProfile()
      .then((profile) => {
        const first = profile.displayName?.trim().split(/\s+/)[0];
        if (first) setGreetingName(first);
      })
      .catch((err: unknown) => reportError("WaitingReview.profile", err));
  }, [api]);

  useEffect(() => {
    void api
      .getOnboardingResponse(relationship.id)
      .then((res) => {
        if (res.submittedAt) setIntakeSubmittedAt(res.submittedAt);
      })
      .catch((err: unknown) => reportError("WaitingReview.intake", err));
  }, [api, relationship.id]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await refreshSession();
    } catch (err) {
      reportError("WaitingReview.refresh", err);
      setError("Couldn't check for your plan (WAIT-REFRESH). Pull to try again.");
    } finally {
      setRefreshing(false);
    }
  }, [refreshSession]);

  useEffect(() => {
    const timer = setInterval(() => {
      void refreshSession().catch((err: unknown) => reportError("WaitingReview.poll", err));
    }, 20_000);
    return () => clearInterval(timer);
  }, [refreshSession]);

  if (detail === "reminders") {
    return (
      <ReminderSettingsScreen
        onBack={() => setDetail(null)}
        onOpenQuietHours={() => setDetail("quiet_hours")}
        coachName={relationship.trainerDisplayName ?? coach}
      />
    );
  }
  if (detail === "quiet_hours") {
    return <QuietHoursScreen onBack={() => setDetail("reminders")} />;
  }
  if (detail === "steps") {
    return <StepsSetupScreen coachName={coach} onBack={() => setDetail(null)} />;
  }

  const sent = sentAtLabel(intakeSubmittedAt, zone);
  const stepsOn = isStepsEnabled(config);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={theme.colors.ink3}
            onRefresh={() => {
              void refresh();
            }}
          />
        }
        testID="waiting-review"
      >
        <View style={styles.head}>
          <View style={styles.flex}>
            <Text tone="ink2" style={styles.date}>
              {formatCivilDate(localDateInTimezone(zone))}
            </Text>
            <Text variant="largeTitle" accessibilityRole="header">
              Hi {greetingName}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Account"
            onPress={() => setAccountOpen(true)}
            style={styles.round}
          >
            <CircleUserRound color={theme.colors.ink} size={26} strokeWidth={1.9} />
          </Pressable>
        </View>

        {error ? <ErrorBanner message={error} /> : null}

        <View style={[styles.card, styles.hero]}>
          <View style={styles.tileLg}>
            <Hourglass color={theme.colors.brandInk} size={30} strokeWidth={1.9} />
          </View>
          <Text variant="title" style={styles.heroTitle} accessibilityRole="header">
            {coach} is building your plan
          </Text>
          <Text tone="ink2" style={styles.heroBody}>
            You&apos;ll get a notification when your first workout and meals are ready.
          </Text>
        </View>

        <Text style={styles.section} accessibilityRole="header">
          WHILE YOU WAIT
        </Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={[styles.tile, styles.tileDone]}>
              <ClipboardCheck color={theme.colors.done} size={20} strokeWidth={1.9} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>Intake form</Text>
              <Text tone="ink2" style={styles.rowSub}>
                {sent ? `Sent ${sent}` : "Sent to " + coach}
              </Text>
            </View>
            <View style={styles.chip}>
              <Text tone="done" style={styles.chipText}>
                Sent
              </Text>
            </View>
          </View>
          <View style={styles.sep} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reminders"
            onPress={() => setDetail("reminders")}
            style={styles.row}
          >
            <View style={styles.tile}>
              <Bell color={theme.colors.ink2} size={20} strokeWidth={1.9} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>Reminders</Text>
              <Text tone="ink2" style={styles.rowSub}>
                Meals, workouts and check-ins
              </Text>
            </View>
            <ChevronRight color={theme.colors.ink4} size={20} strokeWidth={2} />
          </Pressable>
          {stepsOn ? (
            <>
              <View style={styles.sep} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Steps"
                onPress={() => setDetail("steps")}
                style={styles.row}
              >
                <View style={styles.tile}>
                  <Footprints color={theme.colors.ink2} size={20} strokeWidth={1.9} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>Steps</Text>
                  <Text tone="ink2" style={styles.rowSub}>
                    {Platform.OS === "android" ? "Connect Health Connect" : "Connect Apple Health"}
                  </Text>
                </View>
                <ChevronRight color={theme.colors.ink4} size={20} strokeWidth={2} />
              </Pressable>
            </>
          ) : null}
        </View>

        {hasNumber ? (
          <Button
            label={`Message ${coach} on WhatsApp`}
            variant="outline"
            icon={<MessageCircle color={theme.colors.ink} size={22} strokeWidth={2} />}
            accessibilityHint="Opens WhatsApp with a message ready. You press Send."
            onPress={() => {
              const text = `Hi ${coach}, I've filled my FitBud intake and I'm ready when you are.`;
              void Linking.openURL(whatsappHref({ phoneE164, draftText: text })).catch(
                (err: unknown) => reportError("WaitingReview.whatsapp", err),
              );
            }}
          />
        ) : null}
      </ScrollView>

      <BottomSheet
        visible={accountOpen}
        title={me?.email ?? "Account"}
        subtitle="Your plan will be here as soon as it's ready."
        onDismiss={() => setAccountOpen(false)}
      >
        <Button
          label="Sign out"
          variant="dangerQuiet"
          onPress={() => {
            setAccountOpen(false);
            signOut();
          }}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((t) => ({
  safe: { flex: 1, backgroundColor: t.colors.bg },
  content: { gap: 16, paddingBottom: 40, paddingHorizontal: 20, paddingTop: 8 },
  head: { alignItems: "flex-end", flexDirection: "row", gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  date: { fontSize: 16, marginBottom: 2 },
  round: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.edge,
    borderRadius: 24,
    borderWidth: t.scheme === "dark" ? 1 : 0.5,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  card: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.edge,
    borderRadius: 24,
    borderWidth: t.scheme === "dark" ? 1 : 0.5,
    overflow: "hidden",
  },
  hero: { alignItems: "center", padding: 24 },
  tileLg: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 24,
    height: 76,
    justifyContent: "center",
    marginBottom: 16,
    width: 76,
  },
  heroTitle: { fontSize: 22, marginBottom: 6, textAlign: "center" },
  heroBody: { fontSize: 16, lineHeight: 22, textAlign: "center" },
  section: {
    color: t.colors.ink3,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginBottom: -6,
    marginLeft: 8,
    marginTop: 4,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    minHeight: 68,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sep: { backgroundColor: t.colors.line, height: 1, marginLeft: 66 },
  tile: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 10,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  tileDone: { backgroundColor: t.colors.doneTint },
  rowTitle: { color: t.colors.ink, fontSize: 17 },
  rowSub: { fontSize: 15, lineHeight: 20 },
  chip: {
    backgroundColor: t.colors.doneTint,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { fontSize: 14, fontWeight: "700" },
}));

/** WaitingReviewScreen in the system theme (Z12-49). */
export function WaitingReviewScreen(props: Parameters<typeof WaitingReviewScreenBody>[0]) {
  return (
    <ThemeScope scheme="system">
      <WaitingReviewScreenBody {...props} />
    </ThemeScope>
  );
}
