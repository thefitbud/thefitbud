import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type { ExceptionDetail } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Field } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { createIdempotencyKey } from "../lib/idempotency";
import { labelFor } from "./labels";
import { NudgeSheet } from "./sheets/NudgeSheet";
import { ResolveSheet, type ResolveOutcome } from "./sheets/ResolveSheet";

type Props = {
  exceptionId: string;
  onBack: () => void;
  onOpenClient: (relationshipId: string) => void;
};

export function ExceptionReviewScreen({
  exceptionId,
  onBack,
  onOpenClient,
}: Props) {
  const { api } = useAuth();
  const [detail, setDetail] = useState<ExceptionDetail | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [clientWhatsappE164, setClientWhatsappE164] = useState<string | null>(
    null,
  );
  const [traineeName, setTraineeName] = useState("");
  const [ended, setEnded] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [nudgeOpen, setNudgeOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getException(exceptionId);
      setDetail(result);
      try {
        const workspace = await api.getClientWorkspace(
          result.coachingRelationshipId,
        );
        setClientWhatsappE164(workspace.header.clientWhatsappE164 ?? null);
        setTraineeName(workspace.header.traineeDisplayName);
        setEnded(Boolean(workspace.header.endedAt));
      } catch {
        setClientWhatsappE164(null);
      }
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load exception.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, exceptionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function acknowledge() {
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      await api.acknowledgeException(
        exceptionId,
        { note: note.trim() ? note.trim() : null },
        createIdempotencyKey(),
      );
      setMessage("Acknowledged. Source signals were not changed.");
      setNote("");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not acknowledge exception.",
      );
    } finally {
      setActing(false);
    }
  }

  async function resolve(input: {
    outcome: ResolveOutcome | null;
    note: string | null;
  }) {
    setActing(true);
    setError(null);
    setResolveError(null);
    setMessage(null);
    try {
      await api.resolveException(
        exceptionId,
        {
          note: input.note,
          interventionKind: "resolve",
          ...(input.outcome ? { outcome: input.outcome } : {}),
        },
        createIdempotencyKey(),
      );
      setResolveOpen(false);
      setMessage("Resolved. Source signals were not changed.");
      await load();
    } catch (err) {
      setResolveError(
        err instanceof ApiClientError
          ? err.message
          : "Could not resolve exception.",
      );
    } finally {
      setActing(false);
    }
  }

  return (
    <Screen
      title="Exception"
      subtitle="Review the signal, then acknowledge or resolve. Plan edits stay on web."
      footer={
        <PrimaryButton label="Back to attention" variant="ghost" onPress={onBack} />
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      {loading || !detail ? (
        <Text style={styles.muted}>Loading exception…</Text>
      ) : (
        <View style={styles.stack}>
          <View style={styles.banner}>
            <Text style={styles.meta}>
              {labelFor("exception_status", detail.status)} · {labelFor("exception_type", detail.type)}
            </Text>
            <Text style={styles.summary}>{detail.summary}</Text>
            <Text style={styles.muted}>
              Source {detail.sourceEntityType} · Rule {detail.ruleVersion}
            </Text>
          </View>

          {(detail.status === "detected" || detail.status === "active") && (
            <>
              <Field
                label="Note (optional)"
                value={note}
                onChangeText={setNote}
                multiline
                placeholder="Context for yourself — not a coaching decision by FitBud"
              />
              <Text style={styles.sectionLabel}>
                Acknowledge — note you've seen this; signals stay open.
              </Text>
              <PrimaryButton
                label="Acknowledge"
                loading={acting}
                onPress={() => {
                  void acknowledge();
                }}
              />
            </>
          )}

          {detail.status === "acknowledged" && !ended && (
            <>
              <Text style={styles.sectionLabel}>
                Resolve — close this after you've followed up.
              </Text>
              <PrimaryButton
                label="Resolve"
                onPress={() => {
                  setResolveError(null);
                  setResolveOpen(true);
                }}
              />
            </>
          )}

          <PrimaryButton
            label="Open client status"
            variant="secondary"
            onPress={() => onOpenClient(detail.coachingRelationshipId)}
          />

          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Plan adjustment</Text>
            <Text style={styles.muted}>
              Publish a new plan version on trainer web. Mobile does not include
              the plan builder.
            </Text>
          </View>

          {detail.status !== "resolved" && !ended ? (
            <PrimaryButton
              label="Nudge on WhatsApp"
              variant="ghost"
              onPress={() => setNudgeOpen(true)}
            />
          ) : null}
        </View>
      )}
      {detail ? (
        <>
          <ResolveSheet
            visible={resolveOpen}
            detail={detail}
            traineeDisplayName={traineeName}
            acting={acting}
            errorMessage={resolveError}
            onDismiss={() => setResolveOpen(false)}
            onConfirm={(input) => {
              void resolve(input);
            }}
          />
          <NudgeSheet
            visible={nudgeOpen}
            detail={detail}
            traineeDisplayName={traineeName}
            clientWhatsappE164={clientWhatsappE164}
            onDismiss={() => setNudgeOpen(false)}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  banner: {
    backgroundColor: colors.paleLavender,
    borderRadius: 12,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  bannerTitle: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "600",
  },
  meta: {
    color: colors.indigo,
    fontSize: 13,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  summary: {
    color: colors.deepNavy,
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 24,
  },
  sectionLabel: {
    color: colors.darkGrey,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  muted: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  success: {
    color: colors.success,
    fontSize: 14,
    marginBottom: spacing.md,
  },
});
