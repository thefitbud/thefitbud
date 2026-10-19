import { StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import type { CoachingRelationship } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useConfig } from "../providers/ConfigProvider";
import { useAuth } from "../auth/AuthProvider";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { openSupportEmail, DEFAULT_SUPPORT_EMAIL } from "../lib/support";
import { SettingsRow } from "./settings/SettingsRow";
import type { TraineeOverlayOpener } from "../navigation/TraineeOverlay";

type Props = {
  relationship: CoachingRelationship;
  onOpenOverlay: TraineeOverlayOpener;
};

export function MoreScreen({ relationship, onOpenOverlay }: Props) {
  const { me, signOut, selectRole } = useAuth();
  const { config } = useConfig();
  const supportEmail = config?.supportEmail ?? DEFAULT_SUPPORT_EMAIL;
  const trainerName =
    relationship.trainerDisplayName?.trim() ||
    me?.trainerProfile?.displayName?.trim() ||
    "Your coach";

  return (
    <Screen
      chrome="app"
      title="More"
      subtitle={`With ${trainerName}`}
      showHeader={false}
    >
      <View style={styles.stack}>
        <Text style={styles.promise}>
          We'll get back to you within a day when you email support.
        </Text>
        <SettingsRow
          label="Reminder settings"
          hint="Push categories and quiet hours"
          onPress={() => onOpenOverlay({ screen: "reminder_settings" })}
        />
        <SettingsRow
          label="Meal times"
          onPress={() => onOpenOverlay({ screen: "meal_times" })}
        />
        <SettingsRow
          label="Sync status"
          onPress={() => onOpenOverlay({ screen: "sync" })}
        />
        <SettingsRow
          label="Steps"
          onPress={() => onOpenOverlay({ screen: "steps_settings" })}
        />
        <SettingsRow
          label="Widget tips"
          onPress={() => onOpenOverlay({ screen: "widget_tips" })}
        />
        <SettingsRow
          label="Profile"
          onPress={() => onOpenOverlay({ screen: "profile" })}
        />
        <SettingsRow
          label="Privacy"
          onPress={() => onOpenOverlay({ screen: "privacy" })}
        />
        <SettingsRow
          label="Password"
          onPress={() => onOpenOverlay({ screen: "password" })}
        />
        <SettingsRow
          label="Past coaching"
          onPress={() => onOpenOverlay({ screen: "past_coaching" })}
        />
        <PrimaryButton
          label="Help"
          variant="secondary"
          onPress={() => {
            void openSupportEmail({
              supportEmail,
              screenId: "TR-20",
              role: "trainee",
              extra: `Relationship: ${relationship.id}`,
            });
          }}
        />
        {me?.permittedRoles.includes("trainer") ? (
          <PrimaryButton
            label="Switch to trainer mode"
            variant="secondary"
            onPress={() => {
              void selectRole("trainer");
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
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  promise: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
});
