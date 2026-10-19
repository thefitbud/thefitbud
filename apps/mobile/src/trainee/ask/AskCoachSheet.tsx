import { useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Text } from "../../components/Text";
import type {
  CoachingRelationship,
  CreateCoachAskRequest,
} from "@fitbud/contracts";
import {
  askCoachGoLink,
  buildAskCoachMessage,
  whatsappHref,
} from "@fitbud/core";
import { colors, radii, spacing, touchTargetMin } from "@fitbud/ui-mobile";
import { stage1Api } from "../../lib/stage1Api";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";

type CoachAskItemType = CreateCoachAskRequest["itemType"];

const TOPICS = [
  "Swap a food",
  "Portion size",
  "Form check",
  "Pain or discomfort",
  "Can't do this today",
  "Other",
] as const;

type Props = {
  relationship?: CoachingRelationship;
  relationshipId?: string;
  coachName?: string;
  phone?: string | null;
  itemType: CoachAskItemType;
  itemId: string;
  itemLabel: string;
  dateLabel: string;
  /** @deprecated Prefer selecting a topic chip; kept for capture bridge. */
  topic?: string;
  onDone: () => void;
  onCancel: () => void;
};

function goKindForItem(
  itemType: CoachAskItemType,
): "meal" | "workout" | "checkin" | "exercise" | "plan" {
  switch (itemType) {
    case "meal_assignment":
      return "meal";
    case "workout_assignment":
      return "workout";
    case "exercise_execution":
      return "exercise";
    case "checkin":
      return "checkin";
    case "plan_version":
      return "plan";
    default: {
      const _exhaustive: never = itemType;
      return _exhaustive;
    }
  }
}

function firstName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "your coach";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function AskCoachSheet({
  relationship,
  relationshipId,
  coachName,
  phone,
  itemType,
  itemId,
  itemLabel,
  dateLabel,
  topic: initialTopic,
  onDone,
  onCancel,
}: Props) {
  const { api } = useAuth();
  const s1 = stage1Api(api);
  const resolvedRelationshipId = relationship?.id ?? relationshipId ?? "";
  const coach =
    coachName?.trim() ||
    relationship?.trainerDisplayName?.trim() ||
    "Your coach";
  const coachShort = firstName(coach);
  const phoneE164 =
    phone ?? relationship?.trainerWhatsappE164 ?? null;

  const [topic, setTopic] = useState<string>(initialTopic ?? TOPICS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [painAck, setPainAck] = useState(false);

  const hasNumber = Boolean(phoneE164 && phoneE164.replace(/\D/g, "").length >= 10);
  const isPain = topic === "Pain or discomfort";

  const preview = useMemo(() => {
    const link = askCoachGoLink(goKindForItem(itemType), itemId);
    return buildAskCoachMessage({
      coachName: coachShort,
      itemLabel,
      date: dateLabel,
      topic: topic.toLowerCase(),
      link,
    });
  }, [coachShort, dateLabel, itemId, itemLabel, itemType, topic]);

  async function openWhatsApp() {
    if (!hasNumber || !resolvedRelationshipId) return;
    if (isPain && !painAck) {
      setPainAck(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await s1.createCoachAsk({
        relationshipId: resolvedRelationshipId,
        itemType,
        itemId,
        topic: topic.slice(0, 64),
      });
      const url = whatsappHref({
        phoneE164,
        draftText: preview.hrefText,
      });
      try {
        await Linking.openURL(url);
      } catch {
        setError("Couldn't open WhatsApp. The ask was still recorded.");
        setLoading(false);
        return;
      }
      onDone();
    } catch (err) {
      setOffline(true);
      setError(
        err instanceof Error
          ? err.message
          : "You're offline. WhatsApp will send when you're back online.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen
      chrome="app"
      title={`Ask ${coachShort} about ${itemLabel} · ${dateLabel}`}
      subtitle="Pick a topic, then open WhatsApp with a ready draft."
    >
      {error ? <ErrorBanner message={error} /> : null}
      {offline ? (
        <Text style={styles.offline}>
          You're offline. WhatsApp will send when you're back online.
        </Text>
      ) : null}

      <View style={styles.stack}>
        <Text style={styles.sectionLabel} accessibilityRole="header">
          Topic
        </Text>
        <View style={styles.chips}>
          {TOPICS.map((option) => {
            const selected = topic === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={option}
                style={[styles.chip, selected ? styles.chipOn : null]}
                onPress={() => {
                  setTopic(option);
                  setPainAck(false);
                }}
              >
                <Text
                  style={[styles.chipLabel, selected ? styles.chipLabelOn : null]}
                >
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionLabel} accessibilityRole="header">
          Message preview
        </Text>
        <View style={styles.preview}>
          <Text style={styles.previewText}>{preview.hrefText}</Text>
        </View>

        {isPain && painAck ? (
          <Text style={styles.safety}>
            If it's sharp pain or you feel unwell, stop and get medical help.
          </Text>
        ) : null}

        {!hasNumber ? (
          <View style={styles.fallback}>
            <Text style={styles.fallbackTitle}>
              {coachShort} hasn't added a WhatsApp number yet.
            </Text>
            <Text style={styles.fallbackBody}>
              Leave a note in your next check-in instead.
            </Text>
          </View>
        ) : null}

        <PrimaryButton
          label={
            isPain && !painAck
              ? "Continue"
              : loading
                ? "Opening…"
                : "Open WhatsApp"
          }
          variant="whatsapp"
          loading={loading}
          disabled={!hasNumber || loading || !resolvedRelationshipId}
          onPress={() => void openWhatsApp()}
        />
        <Text style={styles.caption}>
          Your message is sent from your WhatsApp. FitBud only notes that you
          asked.
        </Text>
        <PrimaryButton label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  sectionLabel: {
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "700",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    borderColor: colors.lightGrey,
    borderRadius: radii.card,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: touchTargetMin,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipOn: {
    backgroundColor: colors.paleLavender,
    borderColor: colors.indigo,
  },
  chipLabel: {
    color: colors.nearBlack,
    fontSize: 14,
    fontWeight: "500",
  },
  chipLabelOn: {
    color: colors.indigo,
    fontWeight: "600",
  },
  preview: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  previewText: {
    color: colors.darkGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  safety: {
    color: colors.darkGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  fallback: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    gap: spacing.xs,
    padding: spacing.md,
  },
  fallbackTitle: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "600",
  },
  fallbackBody: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
  },
  offline: {
    color: colors.midGrey,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
});
