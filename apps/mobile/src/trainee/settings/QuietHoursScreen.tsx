import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import { brand, ink } from "@fitbud/tokens";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { ErrorBanner } from "../../components/ErrorBanner";
import { QuietHoursPreviewBar } from "../../components/QuietHoursPreviewBar";
import { useAuth } from "../../auth/AuthProvider";
import { clockLabel, shiftQuarterHour, validateQuietHours } from "./clock";
import { M2Button, M2Note, M2Page } from "./m2";

type Props = {
  onBack: () => void;
};

const PRESETS: Array<{ id: string; label: string; start: string; end: string }> = [
  { id: "night", label: "Night 10 pm–7 am", start: "22:00", end: "07:00" },
  { id: "late", label: "Late night 11 pm–6 am", start: "23:00", end: "06:00" },
];

export function QuietHoursScreen({ onBack }: Props) {
  const { api } = useAuth();
  const [start, setStart] = useState("22:00");
  const [end, setEnd] = useState("07:00");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    try {
      const prefs = await api.getNotificationPreferences();
      setStart(prefs.quietHoursStart ?? "22:00");
      setEnd(prefs.quietHoursEnd ?? "07:00");
      const match = PRESETS.some(
        (preset) =>
          preset.start === (prefs.quietHoursStart ?? "22:00") &&
          preset.end === (prefs.quietHoursEnd ?? "07:00"),
      );
      setCustom(!match);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load quiet hours.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const validation = validateQuietHours(start, end);

  async function save() {
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updateNotificationPreferences({
        quietHoursStart: start,
        quietHoursEnd: end,
      });
      setToast("Saved");
    } catch (err) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setOffline(true);
        setToast("Saved on this phone. We'll sync it when you're back online.");
      } else {
        setError(
          err instanceof ApiClientError ? err.message : "Could not save times.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <M2Page
      title="Quiet hours"
      subtitle="No notifications during these hours."
      onBack={onBack}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
      footer={
        <M2Button
          label={saving ? "Saving…" : "Save"}
          disabled={saving || loading}
          onPress={() => {
            void save();
          }}
        />
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      {offline ? (
        <Text style={styles.muted}>You're offline. Pull to try again.</Text>
      ) : null}
      {loading ? (
        <Text accessibilityLabel="Loading quiet hours" style={styles.muted}>
          Loading…
        </Text>
      ) : (
        <>
          <M2Note>
            No notifications during these hours. Reminders that would fall here
            are skipped, not saved for later. Your coach can't override this.
          </M2Note>
          <QuietHoursPreviewBar quietStart={start} quietEnd={end} />
          <View style={styles.presets}>
            {PRESETS.map((preset) => {
              const on = !custom && start === preset.start && end === preset.end;
              return (
                <M2Button
                  key={preset.id}
                  label={preset.label}
                  variant={on ? "primary" : "secondary"}
                  onPress={() => {
                    setCustom(false);
                    setStart(preset.start);
                    setEnd(preset.end);
                    setError(null);
                  }}
                />
              );
            })}
            <M2Button
              label="Custom"
              variant={custom ? "primary" : "secondary"}
              onPress={() => setCustom(true)}
            />
          </View>
          <View style={styles.pickers}>
            <TimeStepper
              label="From"
              value={start}
              onChange={(next) => {
                setCustom(true);
                setStart(next);
              }}
            />
            <TimeStepper
              label="To"
              value={end}
              onChange={(next) => {
                setCustom(true);
                setEnd(next);
              }}
            />
          </View>
          {validation ? <Text style={styles.warn}>{validation}</Text> : null}
          <Text style={styles.rule}>FitBud never sends reminders after 10 pm.</Text>
          {toast ? (
            <Text accessibilityLiveRegion="polite" style={styles.toast}>
              {toast}
            </Text>
          ) : null}
        </>
      )}
    </M2Page>
  );
}

function TimeStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepLabel}>{label}</Text>
      <Text style={styles.clock}>{clockLabel(value)}</Text>
      <View style={styles.row}>
        <M2Button
          label="Earlier"
          variant="secondary"
          onPress={() => onChange(shiftQuarterHour(value, -15))}
        />
        <M2Button
          label="Later"
          variant="secondary"
          onPress={() => onChange(shiftQuarterHour(value, 15))}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { color: ink[500], fontSize: 15 },
  presets: { gap: 8 },
  pickers: { gap: 12 },
  step: {
    backgroundColor: "#fff",
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  stepLabel: {
    color: ink[500],
    fontFamily: fontFamilySemiBold,
    fontSize: 13,
  },
  clock: {
    color: brand.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 28,
  },
  row: { flexDirection: "row", gap: 8 },
  warn: { color: "#9A3412", fontSize: 14, lineHeight: 20 },
  rule: { color: ink[700], fontSize: 14, lineHeight: 20 },
  toast: { color: brand.indigo, fontFamily: fontFamilySemiBold, fontSize: 14 },
});
