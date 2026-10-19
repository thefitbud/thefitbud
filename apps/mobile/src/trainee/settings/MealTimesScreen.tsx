import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import { brand, ink } from "@fitbud/tokens";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { ErrorBanner } from "../../components/ErrorBanner";
import { useAuth } from "../../auth/AuthProvider";
import { stage1Api } from "../../lib/stage1Api";
import {
  clockLabel,
  mealReminderClock,
  shiftQuarterHour,
  validateMealTimes,
} from "./clock";
import { M2Button, M2Note, M2Page } from "./m2";

type Props = {
  onBack: () => void;
  coachName?: string;
};

type Pattern = "all" | "weekdays" | "weekends";

type MealTimeSlot = {
  slotKey: string;
  label: string;
  planTime: string;
  overrideTime?: string | null;
  dayPattern?: Pattern | null;
};

export function MealTimesScreen({ onBack, coachName = "Your coach" }: Props) {
  const { api } = useAuth();
  const s1 = stage1Api(api);
  const first = coachName.split(/\s+/)[0] || "Your coach";
  const [slots, setSlots] = useState<MealTimeSlot[]>([]);
  const [times, setTimes] = useState<Record<string, string>>({});
  const [patterns, setPatterns] = useState<Record<string, Pattern>>({});
  const [review, setReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    try {
      const response = await s1.getMealTimes();
      const rank = (slot: MealTimeSlot) => {
        const key = slot.slotKey.toLowerCase();
        const order = ["breakfast", "lunch", "snack", "dinner"];
        const index = order.indexOf(key);
        return index === -1 ? 50 : index;
      };
      const ordered = [...response.slots].sort(
        (a, b) => rank(a) - rank(b) || a.planTime.localeCompare(b.planTime),
      );
      setSlots(ordered);
      setReview(Boolean(response.mealTimesNeedReview));
      const nextTimes: Record<string, string> = {};
      const nextPatterns: Record<string, Pattern> = {};
      for (const slot of response.slots) {
        nextTimes[slot.slotKey] = slot.overrideTime ?? slot.planTime;
        nextPatterns[slot.slotKey] = slot.dayPattern ?? "all";
      }
      setTimes(nextTimes);
      setPatterns(nextPatterns);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load meal times.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [s1]);

  useEffect(() => {
    void load();
  }, [load]);

  const validation = validateMealTimes(
    slots.map((slot) => ({
      label: slot.label,
      time: times[slot.slotKey] ?? slot.planTime,
    })),
  );

  async function save() {
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await s1.updateMealTimes({
        overrides: slots.map((slot) => ({
          slotKey: slot.slotKey,
          dayPattern: patterns[slot.slotKey] ?? "all",
          time: times[slot.slotKey] ?? slot.planTime,
        })),
      });
      setSlots(response.slots);
      setToast(`Meal times updated. ${first} has been told.`);
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
      title="Your meal times"
      subtitle={`Reminders follow these times. ${first} will see that you changed them.`}
      onBack={onBack}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
      footer={
        slots.length > 0 ? (
          <M2Button
            label={saving ? "Saving…" : "Save"}
            disabled={saving || loading}
            onPress={() => {
              void save();
            }}
          />
        ) : undefined
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      {offline ? (
        <Text style={styles.muted}>You're offline. Pull to try again.</Text>
      ) : null}
      {loading ? (
        <Text accessibilityLabel="Loading meal times" style={styles.muted}>
          Loading…
        </Text>
      ) : slots.length === 0 ? (
        <Text style={styles.muted}>No meal slots on your plan yet.</Text>
      ) : (
        <View style={styles.stack}>
          {review ? (
            <M2Note>Your plan changed. Check your meal times.</M2Note>
          ) : null}
          {validation ? <Text style={styles.warn}>{validation}</Text> : null}
          {toast ? (
            <Text accessibilityLiveRegion="polite" style={styles.toast}>
              {toast}
            </Text>
          ) : null}
          {slots.map((slot) => {
            const time = times[slot.slotKey] ?? slot.planTime;
            const changed = time !== slot.planTime;
            const pattern = patterns[slot.slotKey] ?? "all";
            return (
              <View key={slot.slotKey} style={styles.card}>
                <Text style={styles.label}>{slot.label}</Text>
                <Text style={styles.clock}>{clockLabel(time)}</Text>
                {changed ? (
                  <Text style={styles.plan}>plan {clockLabel(slot.planTime)}</Text>
                ) : null}
                <Text style={styles.reminder}>
                  Reminder about {clockLabel(mealReminderClock(time) ?? time)}
                </Text>
                <View style={styles.row}>
                  <M2Button
                    label="Earlier"
                    variant="secondary"
                    onPress={() =>
                      setTimes((prev) => ({
                        ...prev,
                        [slot.slotKey]: shiftQuarterHour(time, -15, {
                          min: "05:00",
                          max: "22:00",
                        }),
                      }))
                    }
                  />
                  <M2Button
                    label="Later"
                    variant="secondary"
                    onPress={() =>
                      setTimes((prev) => ({
                        ...prev,
                        [slot.slotKey]: shiftQuarterHour(time, 15, {
                          min: "05:00",
                          max: "22:00",
                        }),
                      }))
                    }
                  />
                </View>
                <View style={styles.patterns}>
                  {(
                    [
                      ["all", "Every day"],
                      ["weekdays", "Weekdays"],
                      ["weekends", "Weekends"],
                    ] as const
                  ).map(([id, name]) => (
                    <M2Button
                      key={id}
                      label={name}
                      variant={pattern === id ? "primary" : "secondary"}
                      onPress={() =>
                        setPatterns((prev) => ({ ...prev, [slot.slotKey]: id }))
                      }
                    />
                  ))}
                </View>
                {changed ? (
                  <M2Button
                    label="Reset to plan"
                    variant="secondary"
                    onPress={() =>
                      setTimes((prev) => ({
                        ...prev,
                        [slot.slotKey]: slot.planTime,
                      }))
                    }
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </M2Page>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  muted: { color: ink[500], fontSize: 15 },
  card: {
    backgroundColor: "#fff",
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  label: {
    color: ink[900],
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  clock: {
    color: brand.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 28,
  },
  plan: { color: ink[500], fontSize: 13 },
  reminder: { color: ink[500], fontSize: 14 },
  row: { flexDirection: "row", gap: 8 },
  patterns: { gap: 8 },
  warn: { color: "#9A3412", fontSize: 14, lineHeight: 20 },
  toast: { color: brand.indigo, fontFamily: fontFamilySemiBold, fontSize: 14 },
});
