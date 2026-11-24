import { useCallback, useEffect, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  View,
} from "react-native";
import Constants from "expo-constants";
import {
  ArrowLeftRight,
  Bell,
  ChevronRight,
  CircleHelp,
  CloudOff,
  Footprints,
  MessageCircle,
  RefreshCw,
  User,
} from "lucide-react-native";
import type { CoachingRelationship } from "@fitbud/contracts";
import {
  formatCivilDate,
  formatLocalDate,
  formatPersonName,
  whatsappHref,
} from "@fitbud/core";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { Text } from "../components/Text";
import { useAuth } from "../auth/AuthProvider";
import { isStepsEnabled } from "../lib/config";
import { reportError } from "../lib/reportError";
import type { TraineeOverlayOpener } from "../navigation/TraineeOverlay";
import { mobilePermittedRoles } from "../navigation/resolveRoute";
import { useConfig } from "../providers/ConfigProvider";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../providers/ThemeProvider";
import { useLegalDocument } from "../screens/LegalDocumentScreen";
import { SwitchRoleSheet } from "../screens/RoleSelectScreen";
import { androidTopInset } from "../screens/auth/authParts";
import { useSyncEngine } from "../sync/SyncProvider";
import type { OutboxEntry } from "../sync/engine";
import { M2Group, M2Row, M2Section, m2Gutter } from "./settings/m2";

type Props = {
  relationship: CoachingRelationship;
  onOpenOverlay: TraineeOverlayOpener;
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase() || "•";
}

function civilFromIso(
  iso: string | null | undefined,
  timeZone: string,
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatCivilDate(formatLocalDate(date, timeZone));
}

/** Rows the sign-out sheet counts as unsent (TR-20f). */
export function unsentRows(
  rows: readonly Pick<OutboxEntry, "status">[],
): number {
  return rows.filter(
    (row) =>
      row.status === "pending" ||
      row.status === "in_flight" ||
      row.status === "rejected" ||
      row.status === "conflicted",
  ).length;
}

/** "FitBud 1.0 (214)": app version and native build, when the build has one. */
function versionLabel(): string {
  const version = Constants.expoConfig?.version ?? "0.0.0";
  const build =
    Constants.expoConfig?.ios?.buildNumber ??
    (Constants.expoConfig?.android?.versionCode != null
      ? String(Constants.expoConfig.android.versionCode)
      : null);
  return build ? `FitBud ${version} (${build})` : `FitBud ${version}`;
}

/**
 * TR-20a trainee More, and TM-08d for an account that is also a coach.
 * Settings beyond the mock's four rows live one level down: meal times and
 * quiet hours in Reminders, time zone, language, privacy and past coaching
 * in Account, the credits in the footer (Z12-49, recorded in the PR).
 */
export function MoreScreen(props: Props) {
  return (
    <ThemeScope scheme="system">
      <MoreBody {...props} />
    </ThemeScope>
  );
}

function MoreBody({ relationship, onOpenOverlay }: Props) {
  const { api, me, signOut, selectRole } = useAuth();
  const { config } = useConfig();
  const sync = useSyncEngine();
  const theme = useTheme();
  const styles = useStyles();
  const stepsOn = isStepsEnabled(config);
  const timeZone = me?.timezone || "Asia/Kolkata";
  const coachName = formatPersonName(
    relationship.trainerDisplayName?.trim() || "Your coach",
  );
  const coachFirst = coachName.split(/\s+/)[0] || "your coach";
  // The profile's name; the email's local part only if the profile can't load,
  // so the card never flashes a made-up name first.
  const legal = useLegalDocument();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signOutCount, setSignOutCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const profile = await api.getTraineeProfile();
      setDisplayName(formatPersonName(profile.displayName));
    } catch (err) {
      // The name falls back to the email; nothing else on this screen needs the call.
      reportError("TraineeMore.load", err);
      setDisplayName(
        (current) =>
          current ?? formatPersonName(me?.email?.split("@")[0] ?? "You"),
      );
    } finally {
      setRefreshing(false);
    }
  }, [api, me?.email]);

  useEffect(() => {
    void load();
  }, [load]);

  async function askCoach() {
    const phone = relationship.trainerWhatsappE164;
    if (!phone) return;
    const href = whatsappHref({
      phoneE164: phone,
      draftText: `Hi ${coachFirst}, I have a question.`,
    });
    await Linking.openURL(href).catch((err: unknown) => {
      reportError("TraineeMore.askCoach", err);
      setError("Couldn't open WhatsApp (MORE-WA). Try again.");
    });
  }

  async function beginSignOut() {
    const rows = await sync.store.listOutbox().catch((err: unknown) => {
      reportError("TraineeMore.listOutbox", err);
      return [];
    });
    const count = unsentRows(rows);
    if (count > 0) {
      setSignOutCount(count);
      return;
    }
    signOut();
  }

  async function sendFirst() {
    setSending(true);
    try {
      await sync.sendNow();
      const rows = await sync.store.listOutbox();
      const count = unsentRows(rows);
      if (count === 0) {
        setSignOutCount(null);
        signOut();
        return;
      }
      setSignOutCount(count);
    } catch (err) {
      reportError("TraineeMore.sendFirst", err);
    } finally {
      setSending(false);
    }
  }

  const dual = me
    ? mobilePermittedRoles(me.permittedRoles).includes("trainer")
    : false;
  const endedCoaching = relationship.status === "ended";
  const coachSince = civilFromIso(relationship.startedAt, timeZone);
  const coachHint = endedCoaching
    ? `Coaching ended ${civilFromIso(relationship.endedAt, timeZone) || "recently"}`
    : coachSince
      ? `Since ${coachSince}`
      : "Your coach";
  const profileLine = dual
    ? `Client of ${coachFirst} · also a coach`
    : (me?.email ?? "Profile");
  const hasWhatsApp =
    Boolean(relationship.trainerWhatsappE164) && !endedCoaching;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={theme.colors.ink3}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        testID="trainee-more"
      >
        <Text variant="largeTitle" style={styles.h1} accessibilityRole="header">
          More
        </Text>
        {error ? <ErrorBanner message={error} /> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Profile. ${displayName ?? ""}. ${profileLine}`}
          onPress={() => onOpenOverlay({ screen: "profile" })}
          style={styles.card}
        >
          <View style={[styles.avatar, dual ? styles.avatarDual : null]}>
            <Text
              style={[styles.avatarText, dual ? styles.avatarTextDual : null]}
            >
              {displayName ? initials(displayName) : ""}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1}>
              {displayName ?? " "}
            </Text>
            <Text tone="ink2" style={styles.sub} numberOfLines={1}>
              {profileLine}
            </Text>
          </View>
          <ChevronRight color={theme.colors.ink4} size={20} strokeWidth={2} />
        </Pressable>

        {dual ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Switch to coach view"
            onPress={() => setSwitchOpen(true)}
            style={[styles.card, styles.switchCard]}
            testID="more-switch-to-coach"
          >
            <View style={[styles.tile, styles.tileInfo]}>
              <ArrowLeftRight
                color={theme.colors.info}
                size={20}
                strokeWidth={2}
              />
            </View>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>Switch to coach view</Text>
              <Text tone="ink2" style={styles.sub}>
                Manage your clients
              </Text>
            </View>
            <ChevronRight color={theme.colors.ink4} size={20} strokeWidth={2} />
          </Pressable>
        ) : (
          <View style={styles.card}>
            <View style={styles.coachAvatar}>
              <Text style={styles.coachAvatarText}>{initials(coachName)}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.coachName} numberOfLines={1}>
                {endedCoaching ? coachName : `Coached by ${coachName}`}
              </Text>
              <Text tone="ink2" style={styles.sub} numberOfLines={1}>
                {coachHint}
              </Text>
            </View>
            {hasWhatsApp ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Message ${coachFirst} on WhatsApp`}
                accessibilityHint="Opens WhatsApp with a draft. You press Send."
                onPress={() => {
                  void askCoach();
                }}
                style={styles.chat}
              >
                <MessageCircle
                  color={theme.colors.ink}
                  size={24}
                  strokeWidth={1.9}
                />
              </Pressable>
            ) : null}
          </View>
        )}

        <M2Section label="Settings" />
        <M2Group>
          <M2Row
            icon={
              <Bell color={theme.colors.ink2} size={20} strokeWidth={1.9} />
            }
            label="Reminders"
            hint="Workout, meals, check-in"
            onPress={() => onOpenOverlay({ screen: "reminder_settings" })}
          />
          {stepsOn ? (
            <M2Row
              tile="done"
              icon={
                <Footprints
                  color={theme.colors.done}
                  size={20}
                  strokeWidth={1.9}
                />
              }
              label="Steps"
              hint={
                Platform.OS === "android" ? "Health Connect" : "Apple Health"
              }
              onPress={() => onOpenOverlay({ screen: "steps_settings" })}
            />
          ) : null}
        </M2Group>
        <M2Group>
          <M2Row
            icon={
              <User color={theme.colors.ink2} size={20} strokeWidth={1.9} />
            }
            label="Account"
            hint="Sign-in, password, time zone"
            onPress={() => onOpenOverlay({ screen: "account" })}
          />
          <M2Row
            icon={
              <CircleHelp
                color={theme.colors.ink2}
                size={20}
                strokeWidth={1.9}
              />
            }
            label="Help"
            hint="Email the FitBud team"
            onPress={() => onOpenOverlay({ screen: "help" })}
          />
        </M2Group>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={() => {
            void beginSignOut();
          }}
          style={[styles.card, styles.signOut]}
        >
          <Text tone="crit" style={styles.signOutText}>
            Sign out
          </Text>
        </Pressable>

        <View style={styles.footer}>
          <Text tone="ink3" style={styles.footerText}>
            {versionLabel()} ·{" "}
          </Text>
          <FooterLink
            label="Terms"
            a11y="Terms of Service, opens in the app"
            onPress={() => legal.open("/terms")}
          />
          <Text tone="ink3" style={styles.footerText}>
            {" · "}
          </Text>
          <FooterLink
            label="Privacy"
            a11y="Privacy Policy, opens in the app"
            onPress={() => legal.open("/privacy")}
          />
          <Text tone="ink3" style={styles.footerText}>
            {" · "}
          </Text>
          <FooterLink
            label="Legal"
            a11y="All legal documents, opens in the app"
            onPress={legal.openIndex}
          />
        </View>

        {legal.modal}

        <SignOutSheet
          count={signOutCount}
          sending={sending}
          onSendFirst={() => {
            void sendFirst();
          }}
          onSignOut={() => {
            setSignOutCount(null);
            signOut();
          }}
          onCancel={() => setSignOutCount(null)}
        />

        {dual ? (
          <SwitchRoleSheet
            visible={switchOpen}
            targetRole="trainer"
            busy={switching}
            onCancel={() => setSwitchOpen(false)}
            onSwitch={() => {
              setSwitching(true);
              void selectRole("trainer").finally(() => {
                setSwitching(false);
                setSwitchOpen(false);
              });
            }}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function FooterLink({
  label,
  a11y,
  onPress,
}: {
  label: string;
  a11y: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={styles.footerLink}
    >
      <Text tone="ink2" style={styles.footerText}>
        {label}
      </Text>
    </Pressable>
  );
}

/** TR-20f: unsent logs before sign-out. The behaviour behind it is Z12-41's. */
function SignOutSheet({
  count,
  sending,
  onSendFirst,
  onSignOut,
  onCancel,
}: {
  count: number | null;
  sending: boolean;
  onSendFirst: () => void;
  onSignOut: () => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  if (count == null) return null;
  const title =
    count === 1 ? "1 item isn't sent yet" : `${count} items aren't sent yet`;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCancel}>
      <ThemeScope scheme="system" drivesSystemBars={false}>
        <View style={styles.scrim}>
          <View
            style={styles.dialog}
            accessibilityViewIsModal
            testID="sign-out-unsent"
          >
            <View style={styles.warnTile}>
              <CloudOff color={theme.colors.warn} size={26} strokeWidth={1.9} />
            </View>
            <Text
              variant="title"
              style={styles.dialogTitle}
              accessibilityRole="header"
            >
              {title}
            </Text>
            <Text variant="body" tone="ink2" style={styles.dialogBody}>
              {count === 1
                ? "It's still on this phone. If you sign out now, it'll be lost."
                : "They're still on this phone. If you sign out now, they'll be lost."}
            </Text>
            <View style={styles.dialogActions}>
              <Button
                label="Send first"
                loading={sending}
                icon={
                  <RefreshCw
                    color={theme.colors.onBrand}
                    size={20}
                    strokeWidth={2.25}
                  />
                }
                onPress={onSendFirst}
              />
              <Button
                label="Sign out anyway"
                variant="dangerQuiet"
                onPress={onSignOut}
              />
              <Button label="Cancel" variant="secondary" onPress={onCancel} />
            </View>
          </View>
        </View>
      </ThemeScope>
    </Modal>
  );
}

const useStyles = createThemedStyles((t) => ({
  safe: { flex: 1, backgroundColor: t.colors.bg, paddingTop: androidTopInset },
  scroll: { flex: 1, backgroundColor: t.colors.bg },
  content: {
    gap: 12,
    paddingBottom: 40,
    paddingHorizontal: m2Gutter,
    paddingTop: 8,
  },
  h1: { marginBottom: 8, marginLeft: 4 },
  flex: { flex: 1, minWidth: 0 },
  card: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.edge,
    borderRadius: 20,
    borderWidth: t.scheme === "dark" ? 1 : 0.5,
    flexDirection: "row",
    gap: 14,
    minHeight: 84,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  switchCard: { minHeight: 72, marginTop: -4 },
  avatar: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  avatarDual: { backgroundColor: t.colors.infoTint },
  avatarText: { color: t.colors.ink, fontSize: 19, fontWeight: "700" },
  avatarTextDual: { color: t.colors.info },
  name: {
    color: t.colors.ink,
    fontSize: 21,
    fontWeight: "700",
    lineHeight: 26,
  },
  sub: { fontSize: 16, lineHeight: 21 },
  rowTitle: { color: t.colors.ink, fontSize: 18, lineHeight: 23 },
  coachAvatar: {
    alignItems: "center",
    backgroundColor: t.colors.coach,
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  coachAvatarText: { color: t.colors.onCoach, fontSize: 17, fontWeight: "700" },
  coachName: {
    color: t.colors.ink,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 23,
  },
  chat: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  tile: {
    alignItems: "center",
    borderRadius: 10,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  tileInfo: { backgroundColor: t.colors.infoTint },
  signOut: { minHeight: 60 },
  signOutText: { fontSize: 18 },
  footer: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 8,
  },
  footerLink: { justifyContent: "center", minHeight: 44 },
  footerText: { fontSize: 14 },
  scrim: {
    alignItems: "center",
    backgroundColor: t.colors.scrim,
    flex: 1,
    justifyContent: "center",
    padding: 32,
  },
  dialog: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderRadius: 28,
    maxWidth: 360,
    padding: 24,
    width: "100%",
  },
  warnTile: {
    alignItems: "center",
    backgroundColor: t.colors.warnTint,
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    marginBottom: 16,
    width: 56,
  },
  dialogTitle: { marginBottom: 8, textAlign: "center" },
  dialogBody: { lineHeight: 22, marginBottom: 20, textAlign: "center" },
  dialogActions: { alignSelf: "stretch", gap: 10 },
}));
