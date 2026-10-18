import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth, messageFromError } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Field } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";

const BULLETS = [
  "Your plan, day by day",
  "Log meals and workouts in a tap",
  "Your coach sees your progress",
];

export function AcceptInviteScreen() {
  const { api, refreshSession, signOut, errorMessage, clearError } = useAuth();
  const [token, setToken] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function accept() {
    clearError();
    setLocalError(null);
    const trimmed = token.trim();
    if (!trimmed) {
      setLocalError("Paste the invitation token from your trainer.");
      return;
    }
    setLoading(true);
    try {
      await api.acceptInvitation({
        token: trimmed,
        displayName: displayName.trim() || undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      await refreshSession();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setLocalError(error.message);
      } else {
        setLocalError(messageFromError(error));
      }
    } finally {
      setLoading(false);
    }
  }

  const displayError = localError ?? errorMessage;

  return (
    <Screen
      title="Join your coach"
      subtitle="Accept the invitation to start your FitBud coaching space."
    >
      {displayError ? <ErrorBanner message={displayError} /> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>You're invited to coaching</Text>
        {BULLETS.map((line) => (
          <Text key={line} style={styles.bullet}>
            • {line}
          </Text>
        ))}
      </View>

      <Field
        label="Your name"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="How your coach should address you"
      />

      <Field
        label="Invitation token"
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Paste token from your coach"
      />

      <PrimaryButton
        label="Join coaching"
        loading={loading}
        onPress={() => {
          void accept();
        }}
      />

      <Text style={styles.helper}>
        Open the invite link from WhatsApp when you have the app installed. If
        the link expired, ask your coach for a new one.
      </Text>

      <PrimaryButton
        label="Sign out"
        variant="ghost"
        onPress={signOut}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    gap: spacing.sm,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  cardTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "700",
  },
  bullet: {
    color: colors.darkGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  helper: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.md,
  },
});
