import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import {
  ArrowLeftRight,
  Bell,
  ChevronRight,
  Copyright,
  ExternalLink,
  FileText,
  LogOut,
  Mail,
  Monitor,
  Shield,
  User,
} from "lucide-react-native";
import * as Notifications from "expo-notifications";
import { brand, ink, semantic } from "@fitbud/tokens";
import {
  colors,
  fontFamilyBold,
  fontFamilySemiBold,
  spacing,
} from "@fitbud/ui-mobile";
import { Text } from "../components/Text";
import { useConfig } from "../providers/ConfigProvider";
import { useAuth } from "../auth/AuthProvider";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { openSupportEmail, DEFAULT_SUPPORT_EMAIL } from "../lib/support";
import {
  DEFAULT_TRAINER_WEB_URL,
  legalUrl,
  legalUrlHint,
  trainerWebUrl,
} from "../lib/legalLinks";
import { M2Card, M2Group, M2Row } from "../trainee/settings/m2";

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
 * Trainer More (BT3d, D-W3-14): frame 51's grouped layout plus the same LEGAL
 * group as the trainee DS5 More, governed by `ds5-ios-trainer-more-legal.png`.
 * Rows come from the shared M2 components so the visuals match the trainee screen.
 */
export function TrainerMoreScreen({
  onOpenNotifications,
  onOpenProfile,
}: Props) {
  const { me, signOut, selectRole } = useAuth();
  const { config } = useConfig();
  const supportEmail = config?.supportEmail ?? DEFAULT_SUPPORT_EMAIL;
  const [permission, setPermission] = useState<string>("…");

  useEffect(() => {
    void Notifications.getPermissionsAsync().then((settings) => {
      setPermission(
        settings.status === "granted" ? "On" : "Off · Open settings",
      );
    });
  }, []);

  const email = me?.email ?? null;
  const displayName =
    me?.trainerProfile?.displayName?.trim() || email || "Your profile";

  return (
    <Screen title="More" chrome="app">
      <View style={styles.stack}>
        <M2Card>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profile"
            onPress={onOpenProfile}
            style={styles.prof}
          >
            <View style={styles.avatarLg}>
              <Text style={styles.avatarLgText}>{initials(displayName)}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.profName}>{displayName}</Text>
              {email ? <Text style={styles.profSub}>{email}</Text> : null}
            </View>
            <ChevronRight color={ink[500]} size={18} strokeWidth={2} />
          </Pressable>
        </M2Card>

        <View style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>
            Notifications: {permission}
          </Text>
          <PrimaryButton
            label="Open phone notification settings"
            variant="secondary"
            onPress={() => {
              void Linking.openSettings();
            }}
          />
        </View>

        <View>
          <Text style={styles.groupLabel} accessibilityRole="header">
            Settings
          </Text>
          <M2Group>
            <M2Row
              tile="neutral"
              icon={<Bell color={ink[500]} size={17} strokeWidth={1.75} />}
              label="Notifications"
              onPress={onOpenNotifications}
            />
            <M2Row
              tile="neutral"
              icon={<User color={ink[500]} size={17} strokeWidth={1.75} />}
              label="Profile"
              hint="Name, mobile, email, timezone, password"
              onPress={onOpenProfile}
            />
            {/*
              The frame shows a copy icon and "Copies the link for your laptop".
              The app has no clipboard module (adding one is outside BT3d's
              files_owned) and this row opens the link, as it has since X7. So it
              says so and carries the leaves-the-app icon rather than a copy
              icon it does not honour.
            */}
            <M2Row
              tile="neutral"
              icon={<Monitor color={ink[500]} size={17} strokeWidth={1.75} />}
              label="Open FitBud on web"
              hint="Opens in your browser"
              showChevron={false}
              trailing={
                <ExternalLink color={ink[500]} size={18} strokeWidth={1.75} />
              }
              accessibilityLabel="Open FitBud on web, opens in your browser"
              onPress={() => {
                void Linking.openURL(trainerWebUrl());
              }}
            />
          </M2Group>
        </View>

        {me?.permittedRoles.includes("trainee") ? (
          <M2Group>
            <M2Row
              tile="neutral"
              icon={
                <ArrowLeftRight color={ink[500]} size={17} strokeWidth={1.75} />
              }
              label="Switch to client view"
              onPress={() => {
                void selectRole("trainee");
              }}
            />
          </M2Group>
        ) : null}

        <View>
          <Text style={styles.groupLabel} accessibilityRole="header">
            Legal
          </Text>
          <M2Group>
            <M2Row
              tile="neutral"
              icon={<Shield color={ink[500]} size={17} strokeWidth={1.75} />}
              label="Privacy policy"
              hint={`Opens ${legalUrlHint("/privacy")}`}
              showChevron={false}
              trailing={
                <ExternalLink color={ink[500]} size={18} strokeWidth={1.75} />
              }
              accessibilityLabel="Privacy policy, opens in your browser"
              onPress={() => {
                void Linking.openURL(legalUrl("/privacy"));
              }}
            />
            <M2Row
              tile="neutral"
              icon={<FileText color={ink[500]} size={17} strokeWidth={1.75} />}
              label="Terms of use"
              hint={`Opens ${legalUrlHint("/terms")}`}
              showChevron={false}
              trailing={
                <ExternalLink color={ink[500]} size={18} strokeWidth={1.75} />
              }
              accessibilityLabel="Terms of use, opens in your browser"
              onPress={() => {
                void Linking.openURL(legalUrl("/terms"));
              }}
            />
            <M2Row
              tile="neutral"
              icon={<Copyright color={ink[500]} size={17} strokeWidth={1.75} />}
              label="Credits and licences"
              hint="Exercise drawings and food data"
              showChevron={false}
              trailing={
                <ExternalLink color={ink[500]} size={18} strokeWidth={1.75} />
              }
              accessibilityLabel="Credits and licences, opens in your browser"
              onPress={() => {
                void Linking.openURL(legalUrl("/credits"));
              }}
            />
          </M2Group>
        </View>

        <M2Group>
          <M2Row
            tile="neutral"
            icon={<Mail color={ink[500]} size={17} strokeWidth={1.75} />}
            label="Email FitBud support"
            hint="We'll get back to you within a day."
            onPress={() => {
              void openSupportEmail({
                supportEmail,
                screenId: "TM-07",
                role: "trainer",
              });
            }}
          />
          <M2Row
            tile="critical"
            icon={
              <LogOut
                color={semantic.critical.text}
                size={17}
                strokeWidth={1.75}
              />
            }
            label="Sign out"
            labelColor={semantic.critical.text}
            showChevron={false}
            onPress={signOut}
          />
        </M2Group>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.lg,
    // Screen pads 24pt; frames and the trainee More use 16pt (m2Gutter).
    marginHorizontal: -(spacing.xl - spacing.lg),
  },
  permissionCard: {
    backgroundColor: colors.paleLavender,
    borderRadius: 12,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  permissionTitle: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "600",
  },
  groupLabel: {
    color: ink[500],
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
    backgroundColor: brand.paleLavender,
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  avatarLgText: {
    color: brand.indigo,
    fontFamily: fontFamilyBold,
    fontSize: 19,
  },
  profName: {
    color: brand.deepNavy,
    fontFamily: fontFamilyBold,
    fontSize: 20,
    letterSpacing: -0.2,
    lineHeight: 26,
  },
  profSub: {
    color: ink[500],
    fontSize: 14,
    lineHeight: 19,
  },
  flex: {
    flex: 1,
  },
});
