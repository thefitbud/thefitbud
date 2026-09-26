import { useState } from "react";
import { ApiClientError } from "@fitbud/api-client";
import { useAuth, messageFromError } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Field } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";

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
      // Reload /me + relationships so routing sees trainee role and intake state.
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
      title="Accept invitation"
      subtitle="Enter the invitation token your trainer shared. This links your account and starts onboarding."
    >
      {displayError ? <ErrorBanner message={displayError} /> : null}

      <Field
        label="Invitation token"
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Paste token"
      />
      <Field
        label="Display name (optional)"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Your name"
      />

      <PrimaryButton
        label="Accept invitation"
        loading={loading}
        onPress={() => {
          void accept();
        }}
      />
      <PrimaryButton
        label="Sign out"
        variant="ghost"
        onPress={signOut}
      />
    </Screen>
  );
}
