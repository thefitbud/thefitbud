import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../../components/Text";
import type { CoachingRelationship } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../../auth/AuthProvider";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";

import { CoachingEndedBanner } from "../CoachingEndedBanner";

type Props = {
  onBack: () => void;
  showEndedBanner?: boolean;
  coachName?: string;
  endedAt?: string | null;
};

export function PastCoachingScreen({
  onBack,
  showEndedBanner = false,
  coachName = "Your coach",
  endedAt,
}: Props) {
  const { api } = useAuth();
  const [items, setItems] = useState<CoachingRelationship[]>([]);

  const load = useCallback(async () => {
    const page = await api.listRelationships({ limit: 50 });
    setItems(page.items.filter((row) => row.status === "ended"));
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen title="Past coaching" subtitle="Ended relationships stay on your account.">
      <View style={styles.stack}>
        {showEndedBanner ? (
          <CoachingEndedBanner coachName={coachName} endedAt={endedAt} />
        ) : null}
        {items.length === 0 ? (
          <Text style={styles.muted}>No ended coaching yet.</Text>
        ) : (
          <View style={styles.list}>
          {items.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.title}>Coaching ended</Text>
              <Text style={styles.meta}>
                {item.endedAt
                  ? new Date(item.endedAt).toLocaleDateString("en-IN")
                  : "Date unknown"}
              </Text>
            </View>
          ))}
          </View>
        )}
      </View>
      <PrimaryButton label="Back" variant="ghost" onPress={onBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  muted: {
    color: colors.midGrey,
    fontSize: 15,
  },
  list: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  title: {
    color: colors.deepNavy,
    fontWeight: "600",
  },
  meta: {
    color: colors.midGrey,
    fontSize: 13,
  },
});
