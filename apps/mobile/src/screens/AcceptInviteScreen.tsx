import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { useAuth, messageFromError } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Field } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { stage1Api } from "../lib/stage1Api";

const BULLETS = [
  "Your plan, day by day",
  "Log meals and workouts in a tap",
  "Your coach sees your progress",
];

export function AcceptInviteScreen() {
  const { api, refreshSession, signOut, errorMessage, clearError } = useAuth();
  const s1 = stage1Api(api);
  const [token, setToken] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [trainerName, setTrainerName] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const preview = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (trimmed.length < 8) {
        setTrainerName(null);
        setPreviewStatus(null);
        return;
      }
      try {
        const result = await s1.getInvitationPreview(trimmed);
        setTrainerName(result.trainerDisplayName);
        setPreviewStatus("pending");
        setLocalError(null);
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 410) {
          setLocalError(
            "This invite link has expired. Ask your coach to send a new one.",
          );
          setPreviewStatus("expired");
        }
        setTrainerName(null);
      }
    },
    [s1],
  );

  async function accept() {
    clearError();
    setLocalError(null);
    const trimmed = token.trim();
    if (!trimmed) {
      setLocalError("Paste the invitation token from your trainer.");
      return;
    }
    if (previewStatus === "expired") {
      setLocalError(
        "This invite link has expired. Ask your coach to send a new one.",
      );
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
        if (error.status === 409) {
          setLocalError(
            "You're already coaching with someone on FitBud. Sign in to continue.",
          );
        } else {
          setLocalError(error.message);
        }
      } else {
        setLocalError(messageFromError(error));
      }
    } finally {
      setLoading(false);
    }
  }

  const displayError = localError ?? errorMessage;
  const coach = trainerName ?? "Your coach";

  return (
    <Screen
      title="Join your coach"
      subtitle="Accept the invitation to start your FitBud coaching space."
      refreshing={false}
      onRefresh={() => {
        if (token.trim()) void preview(token);
      }}
    >
      {displayError ? <ErrorBanner message={displayError} /> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {trainerName
            ? `${trainerName} invited you to coaching on FitBud`
            : "You're invited to coaching"}
        </Text>
        {BULLETS.map((line) => (
          <Text key={line} style={styles.bullet}>
            • {line.replace("Your coach", coach)}
          </Text>
        ))}
      </View>

      <Field
        label="Your name"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="How your coach should address you"
      />

      {showCode ? (
        <Field
          label="Invitation code"
          value={token}
          onChangeText={(value) => {
            setToken(value);
            void preview(value);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Paste code from your coach"
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Have a code instead"
          onPress={() => setShowCode(true)}
          style={styles.codeLink}
        >
          <Text style={styles.link}>Have a code instead?</Text>
        </Pressable>
      )}

      <PrimaryButton
        label={trainerName ? `Join ${trainerName.split(/\s+/)[0]}` : "Join coaching"}
        loading={loading}
        onPress={() => {
          void accept();
        }}
      />

      <Text style={styles.helper}>
        Open the invite link from WhatsApp when you have the app installed. If
        the link expired, ask your coach for a new one.
      </Text>

      <PrimaryButton label="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: radii.card,
    borderWidth: 1,
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
  codeLink: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    marginBottom: spacing.md,
  },
  link: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
  helper: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.md,
  },
});
