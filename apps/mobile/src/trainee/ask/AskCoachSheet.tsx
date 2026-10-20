import { useMemo, useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
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
import { colors, spacing, touchTargetMin } from "@fitbud/ui-mobile";
import { stage1Api } from "../../lib/stage1Api";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorBanner } from "../../components/ErrorBanner";
import { M2CloseButton } from "../../components/m2";
import { WhatsAppGlyph } from "../../components/m2/WhatsAppGlyph";

type CoachAskItemType = CreateCoachAskRequest["itemType"];

const MEAL_TOPICS = [
  "Swap a food",
  "Portion size",
  "Form check",
  "Pain or discomfort",
  "Can't do this today",
  "Other",
] as const;

const WORKOUT_TOPICS = [
  "Form check",
  "Pain or discomfort",
  "Can't do this today",
  "Other",
] as const;

const CHECKIN_TOPICS = ["Pain or discomfort", "Other"] as const;

function topicsForItemType(itemType: CoachAskItemType): readonly string[] {
  switch (itemType) {
    case "meal_assignment":
    case "plan_version":
      return MEAL_TOPICS;
    case "workout_assignment":
    case "exercise_execution":
      return WORKOUT_TOPICS;
    case "checkin":
      return CHECKIN_TOPICS;
    default: {
      const _exhaustive: never = itemType;
      return _exhaustive;
    }
  }
}

type Props = {
  relationship?: CoachingRelationship;
  relationshipId?: string;
  coachName?: string;
  phone?: string | null;
  itemType: CoachAskItemType;
  itemId: string;
  itemLabel: string;
  dateLabel: string;
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
  const phoneE164 = phone ?? relationship?.trainerWhatsappE164 ?? null;

  const topics = useMemo(() => topicsForItemType(itemType), [itemType]);
  const defaultTopic = topics[0] ?? "Other";
  const initialAllowed =
    initialTopic && topics.some((t) => t.toLowerCase() === initialTopic.toLowerCase())
      ? topics.find((t) => t.toLowerCase() === initialTopic!.toLowerCase())!
      : defaultTopic;
  const [topic, setTopic] = useState<string>(initialAllowed);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [painAck, setPainAck] = useState(false);

  const hasNumber = Boolean(phoneE164 && phoneE164.replace(/\D/g, "").length >= 10);
  const isPain = topic === "Pain or discomfort";

  const preview = useMemo(() => {
    const link = askCoachGoLink(goKindForItem(itemType), itemId);
    const topicText =
      topic.trim().toLowerCase() === itemLabel.trim().toLowerCase()
        ? "a question"
        : topic.toLowerCase();
    const built = buildAskCoachMessage({
      coachName: coachShort,
      itemLabel,
      date: dateLabel,
      topic: topicText,
      link,
    });
    const shortLink = link.includes("fitbud.app/go/")
      ? "fitbud.app/go/…"
      : link.length > 36
        ? `${link.slice(0, 32)}…`
        : link;
    const plainText = built.hrefText.replace(link, "").trimEnd();
    return { ...built, plainText, shortLink };
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
      setError(
        err instanceof Error
          ? err.message
          : "You're offline. Try again when you're back online.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      animationType="slide"
      transparent
      visible
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={styles.scrim}
          onPress={onCancel}
        />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.sheetHead}>
            <View style={styles.sheetTitles}>
              <Text style={styles.sheetTitle}>
                Ask {coachShort} about {itemLabel} · {dateLabel}
              </Text>
              <Text style={styles.sheetSub}>
                Pick a topic. WhatsApp opens with a draft you can edit.
              </Text>
            </View>
            <M2CloseButton onPress={onCancel} />
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetScroll}
          >
            {error ? <ErrorBanner message={error} /> : null}

            <View style={styles.chips}>
              {topics.map((option) => {
                const selected = topic === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setTopic(option);
                      setPainAck(false);
                    }}
                    style={[styles.chip, selected && styles.chipOn]}
                  >
                    <Text
                      style={[styles.chipLabel, selected && styles.chipLabelOn]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.previewLabel}>Message preview</Text>
            <View style={styles.waprev}>
              <Text style={styles.waprevText} numberOfLines={4}>
                {preview.plainText}
              </Text>
              {preview.shortLink ? (
                <Text style={styles.waprevLink} numberOfLines={1}>
                  {preview.shortLink}
                </Text>
              ) : null}
            </View>

            {isPain && painAck ? (
              <Text style={styles.safety}>
                If it&apos;s sharp pain or you feel unwell, stop and get medical
                help.
              </Text>
            ) : null}

            {!hasNumber ? (
              <Text style={styles.fallback}>
                {coachShort} hasn&apos;t added a WhatsApp number yet.
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={!hasNumber || loading || !resolvedRelationshipId}
              onPress={() => void openWhatsApp()}
              style={[
                styles.waBtn,
                (!hasNumber || loading) && styles.waBtnDisabled,
              ]}
            >
              {loading ? (
                <Text style={styles.waBtnLabel}>Opening…</Text>
              ) : (
                <>
                  <WhatsAppGlyph size={22} />
                  <Text style={styles.waBtnLabel}>
                    {isPain && !painAck ? "Continue" : "Open WhatsApp"}
                  </Text>
                </>
              )}
            </Pressable>
            <Text style={styles.caption}>
              Your message is sent from your WhatsApp. FitBud only notes that you
              asked.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 12, 40, 0.42)",
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "88%",
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    shadowColor: "#0F0C28",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.22,
    shadowRadius: 40,
  },
  grab: {
    alignSelf: "center",
    backgroundColor: "#D5D6DE",
    borderRadius: 3,
    height: 5,
    marginBottom: 10,
    width: 36,
  },
  sheetHead: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sheetTitles: {
    flex: 1,
  },
  sheetTitle: {
    color: colors.deepNavy,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  sheetSub: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },
  sheetScroll: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    borderColor: "#D5D6DE",
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: touchTargetMin,
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
  },
  chipOn: {
    backgroundColor: "#EDE9FF",
    borderColor: "#C9BEFF",
  },
  chipLabel: {
    color: colors.nearBlack,
    fontSize: 15,
    fontWeight: "600",
  },
  chipLabelOn: {
    color: colors.indigo,
  },
  previewLabel: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "600",
    marginTop: spacing.sm,
  },
  waprev: {
    backgroundColor: "#E7F8EE",
    borderColor: "#C9EED8",
    borderRadius: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  waprevText: {
    color: "#14321F",
    fontSize: 15,
    lineHeight: 21,
  },
  waprevLink: {
    color: "#3B6B4D",
    fontSize: 13,
    marginTop: 4,
  },
  safety: {
    color: colors.darkGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  fallback: {
    color: colors.midGrey,
    fontSize: 14,
  },
  caption: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  waBtn: {
    alignItems: "center",
    backgroundColor: colors.indigo,
    borderRadius: 16,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: spacing.lg,
  },
  waBtnDisabled: {
    opacity: 0.5,
  },
  waBtnLabel: {
    color: colors.white,
    fontSize: 17,
    fontWeight: "700",
  },
});
