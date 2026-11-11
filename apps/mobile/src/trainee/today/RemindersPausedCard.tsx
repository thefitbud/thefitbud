import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Pause } from "lucide-react-native";
import type { ReminderStatus } from "@fitbud/contracts";
import { ApiClientError } from "@fitbud/api-client";
import { formatCivilDate, formatLocalDate } from "@fitbud/core";
import { colors, radii, semanticColors, spacing } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { useAuth } from "../../auth/AuthProvider";
import { reportError } from "../../lib/reportError";
import { stage1Api } from "../../lib/stage1Api";

/** The server pauses meal reminders for one week (frame 115). */
const PAUSE_WEEK_MS = 8 * 24 * 60 * 60 * 1000;

export function remindersPausedCopy(
  status: Pick<ReminderStatus, "mode" | "pausedUntil">,
  timeZone: string,
  now = new Date(),
): { title: string; body: string } | null {
  if (status.mode !== "paused") return null;
  const until = status.pausedUntil ? new Date(status.pausedUntil) : null;
  if (!until) {
    return {
      title: "Meal reminders paused",
      body: "They didn't seem to help, so FitBud paused them. Turn them back on anytime.",
    };
  }
  const date = formatCivilDate(formatLocalDate(until, timeZone));
  const forAWeek = until.getTime() - now.getTime() <= PAUSE_WEEK_MS;
  return {
    title: forAWeek ? "Meal reminders paused for a week" : "Meal reminders paused",
    body: `They didn't seem to help, so FitBud paused them until ${date}. Turn them back on anytime.`,
  };
}

/**
 * Today card for paused meal reminders (frame 115). Source: the server's
 * reminder status; it renders nothing in any other mode or if the read fails.
 */
export function RemindersPausedCard() {
  const { api, me } = useAuth();
  const timeZone = me?.timezone || "Asia/Kolkata";
  const [status, setStatus] = useState<ReminderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    stage1Api(api)
      .getReminderStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((err: unknown) => {
        // Optional card: a failed read leaves it out. Logged, never blamed on the user.
        reportError("RemindersPausedCard.getReminderStatus", err);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const resume = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await stage1Api(api).resumeReminders());
    } catch (err) {
      reportError("RemindersPausedCard.resumeReminders", err);
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't turn reminders back on. Try again. (REM-RESUME)",
      );
    } finally {
      setBusy(false);
    }
  }, [api]);

  const copy = status ? remindersPausedCopy(status, timeZone) : null;
  if (!copy) return null;
  const palette = semanticColors.brandSelected;
  return (
    <View style={styles.card} accessibilityLabel={copy.title}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: palette.fill }]}>
          <Pause size={20} color={palette.text} strokeWidth={1.75} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title} accessibilityRole="header">
            {copy.title}
          </Text>
          <Text style={styles.body}>{copy.body}</Text>
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Turn back on"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={() => void resume()}
        style={[styles.button, { backgroundColor: palette.fill }]}
      >
        <Text style={[styles.buttonLabel, { color: palette.text }]}>
          {busy ? "Turning on…" : "Turn back on"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderColor: "#E4E3EE",
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  row: { flexDirection: "row", gap: spacing.md },
  icon: {
    alignItems: "center",
    borderRadius: 14,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  copy: { flex: 1, gap: 4, minWidth: 0 },
  title: { color: colors.deepNavy, fontSize: 17, fontWeight: "600" },
  body: { color: colors.midGrey, fontSize: 15, lineHeight: 21 },
  error: { color: semanticColors.critical.text, fontSize: 14 },
  button: {
    alignItems: "center",
    borderRadius: 16,
    justifyContent: "center",
    minHeight: 48,
  },
  buttonLabel: { fontSize: 16, fontWeight: "600" },
});
