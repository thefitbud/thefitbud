import { useCallback, useEffect, useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Constants from "expo-constants";
import {
  ArrowLeftRight,
  Bell,
  ChevronRight,
  CircleHelp,
  CloudOff,
  ExternalLink,
  Monitor,
} from "lucide-react-native";
import { ApiClientError } from "@fitbud/api-client";
import { fontFamilyBold, fontFamilySemiBold, spacing } from "@fitbud/ui-mobile";
import { Text } from "../components/Text";
import { useConfig } from "../providers/ConfigProvider";
import { useAuth } from "../auth/AuthProvider";
import { Screen } from "../components/Screen";
import { reportError } from "../lib/reportError";
import { DEFAULT_SUPPORT_EMAIL } from "../lib/support";
import { HelpSheet } from "./HelpSheet";
import {
  DEFAULT_TRAINER_WEB_URL,
  legalUrl,
  trainerWebUrl,
} from "../lib/legalLinks";
import { M2Card, M2Group, M2Row } from "../trainee/settings/m2";
import { mobilePermittedRoles } from "../navigation/resolveRoute";
import { isEndedClient } from "./clients";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../providers/ThemeProvider";

/**
 * The trainer-web base URL now lives in `lib/legalLinks.ts`, which the legal rows
 * and both More screens share. Re-exported here so existing importers of
 * `./MoreScreen` keep working with identical behaviour.
 */
export { DEFAULT_TRAINER_WEB_URL, trainerWebUrl };

type Props = {
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase() || "•";
}

/**
 * Frame 51 / TM-07a geometry. Measured on the v3 mock at 393×852: card box
 * left edge 16pt, heading ink ~20pt. `Screen` pads `spacing.xl` and owns no
 * inset prop, so heading and stack pull back off that padding.
 */
export const moreGutter = spacing.lg;
export const moreHeadingNudge = spacing.xs;

/** "FitBud 1.0 (214)": app version and native build, when the build has one. */
export function versionLabel(): string {
  const version = Constants.expoConfig?.version ?? "0.0.0";
  const build =
    Constants.expoConfig?.ios?.buildNumber ??
    (Constants.expoConfig?.android?.versionCode != null
      ? String(Constants.expoConfig.android.versionCode)
      : null);
  return build ? `FitBud ${version} (${build})` : `FitBud ${version}`;
}

function isNetworkFailure(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof ApiClientError) return err.status === 0;
  return err instanceof Error && /fetch|network|offline/i.test(err.message);
}

/**
 * Trainer More (TM-07a): profile card, Settings (Notifications, Open on web,
 * Switch, Help), Sign out, version · Terms · Privacy. Opted into system theme.
 */
export function TrainerMoreScreen({
  onOpenNotifications,
  onOpenProfile,
}: Props) {

  const theme = useTheme();
  const styles = useStyles();
  const { api, me, signOut, requestRoleSelect } = useAuth();
  const { config } = useConfig();
  const supportEmail = config?.supportEmail ?? DEFAULT_SUPPORT_EMAIL;
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const page = await api.listClients({ limit: 50 });
      const active = page.items.filter((item) => !isEndedClient(item)).length;
      setActiveCount(active);
      setOffline(false);
    } catch (err) {
      if (isNetworkFailure(err)) {
        setOffline(true);
      } else {
        reportError("trainer-more-clients", err);
      }
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const email = me?.email ?? null;
  // Only an account with both mobile roles can switch (TM-07a / TM-08c).
  const dualRole = me
    ? mobilePermittedRoles(me.permittedRoles).length > 1
    : false;
  const displayName =
    me?.trainerProfile?.displayName?.trim() || email || "Your profile";
  const coachLine =
    activeCount == null
      ? "Coach"
      : activeCount === 1
        ? "Coach · 1 active client"
        : `Coach · ${activeCount} active clients`;

  return (
    <Screen
      v3
      title="More"
      chrome="app"
      showHeader={false}
      refreshing={false}
      onRefresh={() => {
        void load();
      }}
    >
      <Text
        style={styles.heading}
        accessibilityRole="header"
        accessibilityLabel="More"
      >
        More
      </Text>
      <View style={styles.stack}>
        {offline ? (
          <View style={styles.offline} accessibilityRole="alert">
            <CloudOff color={theme.colors.ink3} size={18} strokeWidth={1.75} />
            <Text style={styles.offlineText}>
              You’re offline. Settings changes need a connection.
            </Text>
          </View>
        ) : null}

        <M2Card>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Profile. ${displayName}. ${coachLine}`}
            onPress={onOpenProfile}
            style={styles.prof}
          >
            <View style={styles.avatarLg}>
              <Text style={styles.avatarLgText}>{initials(displayName)}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.profName}>{displayName}</Text>
              <Text style={styles.profSub}>{coachLine}</Text>
            </View>
            <ChevronRight color={theme.colors.ink3} size={18} strokeWidth={2} />
          </Pressable>
        </M2Card>

        <View>
          <Text style={styles.groupLabel} accessibilityRole="header">
            Settings
          </Text>
          <M2Group>
            <M2Row
              tile="neutral"
              icon={<Bell color={theme.colors.ink3} size={17} strokeWidth={1.75} />}
              label="Notifications"
              hint="Needs you, check-ins, asks"
              onPress={onOpenNotifications}
            />
            <M2Row
              tile="neutral"
              icon={<Monitor color={theme.colors.ink3} size={17} strokeWidth={1.75} />}
              label="Open FitBud on web"
              hint="Plans, templates, invites"
              showChevron={false}
              trailing={
                <ExternalLink color={theme.colors.ink3} size={18} strokeWidth={1.75} />
              }
              accessibilityLabel="Open FitBud on web, opens in your browser"
              onPress={() => {
                void Linking.openURL(trainerWebUrl());
              }}
            />
            {dualRole ? (
              <M2Row
                tile="neutral"
                icon={
                  <ArrowLeftRight
                    color={theme.colors.ink3}
                    size={17}
                    strokeWidth={1.75}
                  />
                }
                label="Switch to client view"
                hint="Follow your own plan"
                onPress={requestRoleSelect}
              />
            ) : null}
            <M2Row
              tile="neutral"
              icon={
                <CircleHelp color={theme.colors.ink3} size={17} strokeWidth={1.75} />
              }
              label="Help"
              hint="Email the FitBud team"
              onPress={() => setHelpOpen(true)}
            />
          </M2Group>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={() => setConfirmSignOut(true)}
          style={styles.signOut}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{versionLabel()} · </Text>
          <FooterLink
            label="Terms"
            a11y="Terms of use, opens in your browser"
            path="/terms"
          />
          <Text style={styles.footerText}> · </Text>
          <FooterLink
            label="Privacy"
            a11y="Privacy policy, opens in your browser"
            path="/privacy"
          />
        </View>
      </View>
      <HelpSheet
        visible={helpOpen}
        onDismiss={() => setHelpOpen(false)}
        supportEmail={supportEmail}
        screen="More"
      />
      <SignOutConfirm
        visible={confirmSignOut}
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => {
          setConfirmSignOut(false);
          signOut();
        }}
      />
    </Screen>
  );
}

function FooterLink({
  label,
  a11y,
  path,
}: {
  label: string;
  a11y: string;
  path: Parameters<typeof legalUrl>[0];
}) {

  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={a11y}
      onPress={() => {
        void Linking.openURL(legalUrl(path));
      }}
    >
      <Text style={styles.footerLink}>{label}</Text>
    </Pressable>
  );
}

/**
 * TM-07f: an action sheet with the question, the one destructive action and
 * Cancel. Copy matches the mock.
 */
export function SignOutConfirm({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ThemeScope scheme="system" drivesSystemBars={false}>
      <SignOutConfirmBody
        visible={visible}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </ThemeScope>
  );
}

function SignOutConfirmBody({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onCancel}
    >
      <View style={styles.confirmRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={styles.confirmScrim}
          onPress={onCancel}
        />
        <View style={styles.confirmGroup}>
          <View style={styles.confirmHead}>
            <Text style={styles.confirmTitle} accessibilityRole="header">
              Sign out of FitBud?
            </Text>
            <Text style={styles.confirmMsg}>
              You'll need your password or an email code to sign back in.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            onPress={onConfirm}
            style={styles.confirmBtn}
          >
            <Text
              style={[styles.confirmBtnText, { color: theme.colors.crit }]}
            >
              Sign out
            </Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={onCancel}
          style={[styles.confirmGroup, styles.confirmCancel]}
        >
          <Text style={[styles.confirmBtnText, { color: theme.colors.brand }]}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const useStyles = createThemedStyles((t) => ({
  confirmRoot: {
    flex: 1,
    gap: 8,
    justifyContent: "flex-end",
    padding: 8,
    paddingBottom: spacing.lg,
  },
  confirmScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 17, 21, 0.45)",
  },
  confirmGroup: {
    backgroundColor: t.colors.card,
    borderRadius: 14,
    overflow: "hidden",
  },
  confirmHead: {
    borderBottomColor: t.colors.line,
    borderBottomWidth: 1,
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  confirmTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
    textAlign: "center",
  },
  confirmMsg: {
    color: t.colors.ink3,
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },
  confirmBtn: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
  },
  confirmCancel: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
  },
  confirmBtnText: {
    fontFamily: fontFamilySemiBold,
    fontSize: 20,
  },
  heading: {
    color: t.colors.ink,
    fontFamily: fontFamilyBold,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.4,
    marginBottom: spacing.xs,
    marginLeft: -(spacing.xl - moreGutter - moreHeadingNudge),
  },
  stack: {
    gap: spacing.lg,
    marginHorizontal: -(spacing.xl - moreGutter),
  },
  offline: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  offlineText: {
    color: t.colors.ink3,
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  groupLabel: {
    color: t.colors.ink3,
    fontFamily: fontFamilySemiBold,
    fontSize: 12,
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
    textTransform: "uppercase",
  },
  prof: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    minHeight: 84,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  avatarLg: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  avatarLgText: {
    color: t.colors.brand,
    fontFamily: fontFamilyBold,
    fontSize: 19,
  },
  profName: {
    color: t.colors.ink,
    fontFamily: fontFamilyBold,
    fontSize: 20,
    letterSpacing: -0.2,
    lineHeight: 26,
  },
  profSub: {
    color: t.colors.ink3,
    fontSize: 14,
    lineHeight: 19,
  },
  flex: {
    flex: 1,
  },
  signOut: {
    backgroundColor: t.colors.card,
    borderRadius: 16,
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  signOutText: {
    color: t.colors.crit,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
  },
  footer: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  footerText: {
    color: t.colors.ink3,
    fontSize: 13,
  },
  footerLink: {
    color: t.colors.ink3,
    fontSize: 13,
    textDecorationLine: "underline",
  },
}));
