import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useConfig } from "../providers/ConfigProvider";
import { useAuth } from "../auth/AuthProvider";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { openSupportEmail, DEFAULT_SUPPORT_EMAIL } from "../lib/support";

type Props = {
  onOpenReminderSettings?: () => void;
};

export function TrainerMoreScreen({ onOpenReminderSettings }: Props) {
  const { me, signOut, selectRole } = useAuth();
  const { config } = useConfig();
  const supportEmail = config?.supportEmail ?? DEFAULT_SUPPORT_EMAIL;

  return (
    <Screen title="More" subtitle="Account and notifications.">
      <View style={styles.stack}>
        <Text style={styles.body}>
          Plan builder and templates stay on trainer web. Mobile is for attention,
          clients, and check-ins.
        </Text>
        {onOpenReminderSettings ? (
          <PrimaryButton
            label="Notification settings"
            variant="secondary"
            onPress={onOpenReminderSettings}
          />
        ) : null}
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
            label="Switch to trainee mode"
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
    gap: spacing.lg,
  },
  body: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
});
