import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import { colors, spacing } from "@fitbud/ui-mobile";
import { stage1Api } from "../../lib/stage1Api";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";

type Props = {
  onBack: () => void;
};

export function MealTimesScreen({ onBack }: Props) {
  const { api } = useAuth();
  const s1 = stage1Api(api);
  const [slots, setSlots] = useState<
    Array<{
      slotKey: string;
      label: string;
      planTime: string;
      overrideTime?: string | null;
    }>
  >([]);
  const [times, setTimes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await s1.getMealTimes();
      setSlots(response.slots);
      const map: Record<string, string> = {};
      for (const slot of response.slots) {
        map[slot.slotKey] = slot.overrideTime ?? slot.planTime;
      }
      setTimes(map);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load meal times.",
      );
    } finally {
      setLoading(false);
    }
  }, [s1]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await s1.putMealTimes({
        overrides: slots.map((slot) => ({
          slotKey: slot.slotKey,
          dayPattern: "*",
          time: times[slot.slotKey] ?? slot.planTime,
        })),
      });
      onBack();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not save times.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      title="Meal times"
      subtitle="Reminders follow these times. Your coach sees when you change them."
    >
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : slots.length === 0 ? (
        <Text style={styles.muted}>No meal slots on your plan yet.</Text>
      ) : (
        <View style={styles.stack}>
          {slots.map((slot) => (
            <View key={slot.slotKey} style={styles.row}>
              <Text style={styles.label}>{slot.label}</Text>
              <TextInput
                accessibilityLabel={`${slot.label} time`}
                value={times[slot.slotKey] ?? ""}
                onChangeText={(value) =>
                  setTimes((prev) => ({ ...prev, [slot.slotKey]: value }))
                }
                placeholder={slot.planTime}
                placeholderTextColor={colors.midGrey}
                style={styles.input}
              />
              <Text style={styles.planHint}>Plan default {slot.planTime}</Text>
            </View>
          ))}
          <PrimaryButton label="Save" loading={saving} onPress={() => void save()} />
          <PrimaryButton label="Cancel" variant="ghost" onPress={onBack} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.lg,
  },
  muted: {
    color: colors.midGrey,
    fontSize: 15,
  },
  row: {
    backgroundColor: colors.white,
    borderRadius: 12,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  label: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
  input: {
    borderColor: colors.lightGrey,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.nearBlack,
    fontSize: 16,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  planHint: {
    color: colors.midGrey,
    fontSize: 12,
  },
});
