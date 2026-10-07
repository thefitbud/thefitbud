import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Field } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { resolveApiBaseUrl } from "../lib/api";
import { createTestIdToken, isTestIdToken } from "../lib/testToken";

export function AuthScreen() {
  const { signInWithToken, errorMessage, clearError } = useAuth();
  const [uid, setUid] = useState("");
  const [email, setEmail] = useState("");
  const [rawToken, setRawToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function continueWithIdentity() {
    clearError();
    setLocalError(null);
    setLoading(true);
    try {
      let token = rawToken.trim();
      if (!token) {
        token = createTestIdToken(uid, email || undefined);
      } else if (!isTestIdToken(token) && !token.includes(".")) {
        // Treat a bare UID pasted into the token field as a test identity.
        token = createTestIdToken(token);
      }
      await signInWithToken(token);
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : "Could not build a test token.",
      );
    } finally {
      setLoading(false);
    }
  }

  const displayError = localError ?? errorMessage;

  return (
    <Screen
      title="Sign in"
      subtitle="Local and test mode uses a bearer test token against the FitBud API. Production Firebase sign-in is not wired yet."
    >
      {displayError ? <ErrorBanner message={displayError} /> : null}

      <View style={styles.meta}>
        <Text style={styles.metaLabel}>API</Text>
        <Text style={styles.metaValue}>{resolveApiBaseUrl()}</Text>
      </View>

      <Field
        label="Firebase UID"
        value={uid}
        onChangeText={setUid}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="trainee-local-1 or trainer-local-1"
        hint="Used to build a test.<payload> bearer token."
      />
      <Field
        label="Email (optional)"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="trainee@example.com"
      />
      <Field
        label="Or paste test token"
        value={rawToken}
        onChangeText={setRawToken}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="test.eyJ1aWQiOi4uLn0"
        hint="Leave blank to generate from UID and email."
      />

      <PrimaryButton
        label="Continue"
        loading={loading}
        onPress={() => {
          void continueWithIdentity();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: {
    backgroundColor: colors.paleLavender,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  metaLabel: {
    color: colors.midGrey,
    fontSize: 12,
    fontWeight: "500",
    marginBottom: spacing.xs,
  },
  metaValue: {
    color: colors.deepNavy,
    fontSize: 14,
  },
});
