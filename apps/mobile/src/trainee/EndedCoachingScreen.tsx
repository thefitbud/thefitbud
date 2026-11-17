import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  View,
} from "react-native";
import { Clock, Info, Mail } from "lucide-react-native";
import type {
  CoachingRelationship,
  PendingReactivation,
} from "@fitbud/contracts";
import {
  formatCivilDate,
  formatLocalDate,
  formatPersonName,
} from "@fitbud/core";
import { messageFromError, useAuth } from "../auth/AuthProvider";
import { BottomSheet } from "../components/BottomSheet";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { Field } from "../components/Field";
import { Text } from "../components/Text";
import { localDateInTimezone } from "../lib/dates";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../providers/ThemeProvider";
import { initials } from "./MoreScreen";

type Props = {
  relationship: CoachingRelationship;
  coachName: string;
  onOpenHistory: () => void;
  onSignOut: () => void;
  onCoachingResumed: (relationship: CoachingRelationship) => void;
  /**
   * Rendered inside the Today tab under the shell's own header and tab bar
   * (TR-22a). Standalone (no tab bar) it draws the Today title itself and
   * keeps a Sign out link, since More is out of reach.
   */
  embedded?: boolean;
};

function endedOn(iso: string | null | undefined, zone: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return formatCivilDate(formatLocalDate(date, zone));
}

/** Whether a restart request can still be confirmed (TR-22b). */
export function reactivationOpen(
  pending: PendingReactivation | null | undefined,
  now = Date.now(),
): pending is PendingReactivation {
  return pending != null && new Date(pending.expiresAt).getTime() >= now;
}

/**
 * TR-22a: an ended trainee's Today. The history stays (View past coaching),
 * a new coach starts from an invite link or code, and ended clients are
 * read-only (nothing here logs). TR-22b: the coach asked to restart — a sheet
 * to confirm. Account reactivation after deletion is Z12-29's (D-W12-25).
 */
export function EndedCoachingScreen(props: Props) {
  return (
    <ThemeScope scheme="system">
      <EndedBody {...props} />
    </ThemeScope>
  );
}

function EndedBody({
  relationship,
  coachName,
  onOpenHistory,
  onSignOut,
  onCoachingResumed,
  embedded = false,
}: Props) {
  const { api, me } = useAuth();
  const theme = useTheme();
  const styles = useStyles();
  const zone = me?.timezone || "Asia/Kolkata";
  const coach = formatPersonName(coachName.trim() || "your coach");
  const coachFirst = coach.split(/\s+/)[0] || coach;
  const [pending, setPending] = useState<
    PendingReactivation | null | undefined
  >(relationship.pendingReactivation);
  const [sheetDismissed, setSheetDismissed] = useState(false);
  const [loading, setLoading] = useState(
    relationship.pendingReactivation === undefined,
  );
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  const refreshPending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await api.getRelationship(relationship.id);
      setPending(detail.pendingReactivation ?? null);
    } catch (err) {
      setError(messageFromError(err));
      setPending(null);
    } finally {
      setLoading(false);
    }
  }, [api, relationship.id]);

  useEffect(() => {
    if (relationship.pendingReactivation !== undefined) {
      setPending(relationship.pendingReactivation);
      setLoading(false);
      return;
    }
    void refreshPending();
  }, [relationship.id, relationship.pendingReactivation, refreshPending]);

  const open = reactivationOpen(pending);
  const expired = pending != null && !open;
  const when = endedOn(relationship.endedAt, zone);

  async function confirmRestart() {
    setConfirming(true);
    setError(null);
    try {
      const updated = await api.confirmReactivation(relationship.id);
      onCoachingResumed(updated);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setConfirming(false);
    }
  }

  async function useCode() {
    const token = inviteCode.trim();
    if (!token) {
      setCodeError("Enter the code from your new coach.");
      return;
    }
    setJoining(true);
    setCodeError(null);
    try {
      await api.acceptInvitation({
        token,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      setInviteCode("");
      setCodeOpen(false);
      setJoined(true);
    } catch (err) {
      setCodeError(messageFromError(err));
    } finally {
      setJoining(false);
    }
  }

  const body = (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          tintColor={theme.colors.ink3}
          onRefresh={() => {
            void refreshPending();
          }}
        />
      }
      testID="ended-coaching"
    >
      {embedded ? null : (
        <View style={styles.head}>
          <Text tone="ink2" style={styles.date}>
            {formatCivilDate(localDateInTimezone(zone))}
          </Text>
          <Text variant="largeTitle" accessibilityRole="header">
            Today
          </Text>
        </View>
      )}

      <View style={styles.banner} accessibilityRole="text">
        <Info color={theme.colors.ink2} size={22} strokeWidth={1.9} />
        <Text tone="ink2" style={styles.bannerText}>
          {when
            ? `Coaching with ${coachFirst} ended on ${when}.`
            : `Coaching with ${coachFirst} has ended.`}
        </Text>
      </View>

      {error ? <ErrorBanner message={error} /> : null}
      {expired ? (
        <Text tone="ink2" style={styles.note}>
          {coachFirst}&apos;s request to restart has expired. Ask {coachFirst}{" "}
          to send a new one.
        </Text>
      ) : null}
      {joined ? (
        <Text tone="done" style={styles.note} accessibilityLiveRegion="polite">
          Code accepted. Your new coach will see you shortly.
        </Text>
      ) : null}

      <View style={[styles.card, styles.center]}>
        <View style={styles.tileLg}>
          <Clock color={theme.colors.brandInk} size={30} strokeWidth={1.9} />
        </View>
        <Text
          variant="title"
          style={styles.cardTitle}
          accessibilityRole="header"
        >
          Your history is safe
        </Text>
        <Text tone="ink2" style={styles.cardBody}>
          Workouts, meals and check-ins from your time with {coachFirst} stay
          here.
        </Text>
        <View style={styles.cardAction}>
          <Button
            label="View past coaching"
            variant="secondary"
            onPress={onOpenHistory}
          />
        </View>
      </View>

      <View style={[styles.card, styles.row]}>
        <View style={styles.tile}>
          <Mail color={theme.colors.brandInk} size={24} strokeWidth={1.9} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.rowTitle}>New coach?</Text>
          <Text tone="ink2" style={styles.rowBody}>
            Open their invite link, or enter a code.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enter code"
          onPress={() => {
            setCodeError(null);
            setCodeOpen(true);
          }}
          style={styles.link}
        >
          <Text style={styles.linkText}>Enter code</Text>
        </Pressable>
      </View>

      {embedded ? null : (
        <Button label="Sign out" variant="text" onPress={onSignOut} />
      )}

      <BottomSheet
        visible={codeOpen}
        title="Enter your code"
        subtitle="It's in the invite your new coach sent."
        onDismiss={() => setCodeOpen(false)}
      >
        {codeError ? <ErrorBanner message={codeError} /> : null}
        <Field
          label="Invite code"
          value={inviteCode}
          onChangeText={setInviteCode}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Code from your coach"
        />
        <Button
          label="Use this code"
          loading={joining}
          onPress={() => {
            void useCode();
          }}
        />
      </BottomSheet>

      {open && !sheetDismissed && !loading ? (
        <RestartSheet
          visible
          coach={coach}
          intakeUpdateRequested={Boolean(pending?.intakeUpdateRequested)}
          confirming={confirming}
          onRestart={() => {
            void confirmRestart();
          }}
          onNotNow={() => setSheetDismissed(true)}
        />
      ) : null}
    </ScrollView>
  );

  if (embedded) return body;
  return <SafeAreaView style={styles.safe}>{body}</SafeAreaView>;
}

/** TR-22b: the coach wants to restart. */
function RestartSheet({
  visible,
  coach,
  intakeUpdateRequested,
  confirming,
  onRestart,
  onNotNow,
}: {
  visible: boolean;
  coach: string;
  intakeUpdateRequested: boolean;
  confirming: boolean;
  onRestart: () => void;
  onNotNow: () => void;
}) {
  const styles = useStyles();
  const first = coach.split(/\s+/)[0] || coach;
  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onNotNow}
    >
      <ThemeScope scheme="system" drivesSystemBars={false}>
        <View style={styles.sheetWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss sheet"
            style={styles.scrim}
            onPress={onNotNow}
          />
          <View
            style={styles.sheet}
            accessibilityViewIsModal
            testID="restart-coaching-sheet"
          >
            <View style={styles.handle} accessibilityElementsHidden />
            <View style={styles.coachAvatar}>
              <Text style={styles.coachAvatarText}>{initials(coach)}</Text>
            </View>
            <Text
              variant="title"
              style={styles.sheetTitle}
              accessibilityRole="header"
            >
              {first} wants to coach you again
            </Text>
            <Text tone="ink2" style={styles.sheetBody}>
              Your history with {first} stays. {first} will send your plan when
              coaching picks up again.
              {intakeUpdateRequested
                ? " You may be asked to refresh your intake answers first."
                : ""}
            </Text>
            <View style={styles.sheetActions}>
              <Button
                label={`Restart with ${first}`}
                loading={confirming}
                onPress={onRestart}
              />
              <Button label="Not now" variant="secondary" onPress={onNotNow} />
            </View>
          </View>
        </View>
      </ThemeScope>
    </Modal>
  );
}

const useStyles = createThemedStyles((t) => ({
  safe: { flex: 1, backgroundColor: t.colors.bg },
  scroll: { flex: 1, backgroundColor: t.colors.bg },
  content: { gap: 16, paddingBottom: 32, paddingHorizontal: 20, paddingTop: 8 },
  head: { gap: 2, marginBottom: 4 },
  date: { fontSize: 16 },
  flex: { flex: 1 },
  banner: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 18,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  bannerText: { flex: 1, fontSize: 16, lineHeight: 22 },
  note: { fontSize: 15, lineHeight: 21, paddingHorizontal: 4 },
  card: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.edge,
    borderRadius: 24,
    borderWidth: t.scheme === "dark" ? 1 : 0.5,
    padding: 20,
  },
  center: { alignItems: "center" },
  tileLg: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 24,
    height: 76,
    justifyContent: "center",
    marginBottom: 16,
    marginTop: 8,
    width: 76,
  },
  cardTitle: { fontSize: 22, marginBottom: 6, textAlign: "center" },
  cardBody: { fontSize: 16, lineHeight: 22, textAlign: "center" },
  cardAction: { alignSelf: "stretch", marginTop: 20, paddingHorizontal: 16 },
  row: { alignItems: "center", flexDirection: "row", gap: 14 },
  tile: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 16,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  rowTitle: { color: t.colors.ink, fontSize: 18, fontWeight: "700" },
  rowBody: { fontSize: 16, lineHeight: 21 },
  link: { justifyContent: "center", minHeight: 44 },
  linkText: { color: t.colors.ink, fontSize: 16, fontWeight: "600" },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  scrim: {
    backgroundColor: t.colors.scrim,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  sheet: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 34,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    backgroundColor: t.colors.line2,
    borderRadius: 3,
    height: 5,
    marginBottom: 20,
    width: 36,
  },
  coachAvatar: {
    alignItems: "center",
    backgroundColor: t.colors.coach,
    borderRadius: 26,
    height: 52,
    justifyContent: "center",
    marginBottom: 12,
    width: 52,
  },
  coachAvatarText: { color: t.colors.onCoach, fontSize: 18, fontWeight: "700" },
  sheetTitle: { fontSize: 24, marginBottom: 8, textAlign: "center" },
  sheetBody: {
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 20,
    textAlign: "center",
  },
  sheetActions: { alignSelf: "stretch", gap: 10 },
}));
