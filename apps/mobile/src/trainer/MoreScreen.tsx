import { useEffect, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import * as Notifications from "expo-notifications";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useConfig } from "../providers/ConfigProvider";
import { useAuth } from "../auth/AuthProvider";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { openSupportEmail, DEFAULT_SUPPORT_EMAIL } from "../lib/support";

/** Trainer web (D-W2-7). Staging builds set EXPO_PUBLIC_TRAINER_WEB_URL in eas.json. */
export const DEFAULT_TRAINER_WEB_URL = "https://app.thefitbud.com";

/**
 * Keep the literal `process.env.EXPO_PUBLIC_TRAINER_WEB_URL` member expression:
 * Expo's Babel transform only inlines that exact form into the bundle.
 */
export function trainerWebUrl(): string {
  return process.env.EXPO_PUBLIC_TRAINER_WEB_URL?.trim() || DEFAULT_TRAINER_WEB_URL;
}

type Props = {
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
};

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

  return (
    <Screen title="More" subtitle="Settings, profile, and sign out.">
      <View style={styles.stack}>
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
        <PrimaryButton
          label="Notifications"
          variant="secondary"
          onPress={onOpenNotifications}
        />
        <PrimaryButton
          label="Profile"
          variant="secondary"
          onPress={onOpenProfile}
        />
        <PrimaryButton
          label="Open FitBud on web"
          variant="secondary"
          onPress={() => {
            void Linking.openURL(trainerWebUrl());
          }}
        />
        <PrimaryButton
          label="Help"
          variant="secondary"
          onPress={() => {
            void openSupportEmail({
              supportEmail,
              screenId: "TM-07",
              role: "trainer",
            });
          }}
        />
        {me?.permittedRoles.includes("trainee") ? (
          <PrimaryButton
            label="Switch to client view"
            variant="secondary"
            onPress={() => {
              void selectRole("trainee");
            }}
          />
        ) : null}
        <PrimaryButton label="Sign out" variant="ghost" onPress={signOut} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
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
});
