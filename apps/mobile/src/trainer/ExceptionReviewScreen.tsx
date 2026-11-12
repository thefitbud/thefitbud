import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type { ExceptionDetail } from "@fitbud/contracts";
import type { NoteSaveInput } from "./sheets/NoteSheet";
import { deviceTimeZone } from "@fitbud/core";
import { Ban, CircleCheck, FileQuestion, WifiOff } from "lucide-react-native";
import {
  colors,
  semanticColors,
  spacing,
  touchTargetMin,
} from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Field } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { createIdempotencyKey } from "../lib/idempotency";
import { reportError } from "../lib/reportError";
import { labelFor } from "./labels";
import { firstNameOf } from "./sheets/exceptionSheetContent";
import { MoreSheet } from "./sheets/MoreSheet";
import { NoteSheet } from "./sheets/NoteSheet";
import { NudgeSheet } from "./sheets/NudgeSheet";
import {
  endedBannerText,
  isNetworkFailure,
  isNotFound,
  offlineBannerText,
  resolvedBannerText,
} from "./sheets/exceptionStateContent";
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
  const { api, me } = useAuth();
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
  // "unknown" until the client workspace answers: live actions stay hidden
  // so an ended client is never offered Acknowledge, Note or Nudge.
  const [coaching, setCoaching] = useState<"unknown" | "active" | "ended">(
    "unknown",
  );
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [offline, setOffline] = useState(false);
  const [lastUpdateAt, setLastUpdateAt] = useState<string | null>(null);
  const trainerZone = deviceTimeZone();
  const ended = coaching === "ended";
  const canAct = coaching === "active" && !offline;
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  // One idempotency key per composer session, reused when Save is retried.
  const noteKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const result = await api.getException(exceptionId);
      setDetail(result);
      setOffline(false);
      setLastUpdateAt(new Date().toISOString());
      try {
        const workspace = await api.getClientWorkspace(
          result.coachingRelationshipId,
        );
        setClientWhatsappE164(workspace.header.clientWhatsappE164 ?? null);
        setTraineeName(workspace.header.traineeDisplayName);
        setEndedAt(workspace.header.endedAt ?? null);
        setCoaching(workspace.header.endedAt ? "ended" : "active");
      } catch (err) {
        // Ended-ness is unknown: keep live actions hidden until a retry works.
        setClientWhatsappE164(null);
        setCoaching("unknown");
        if (isNetworkFailure(err)) {
          setOffline(true);
        } else {
          reportError("trainer.exception.workspace", err);
          setError("Could not check the client's status. (EXC-WS)");
        }
      }
    } catch (err) {
      if (isNotFound(err)) {
        setDetail(null);
        setNotFound(true);
      } else if (isNetworkFailure(err)) {
        setOffline(true);
      } else {
        if (!(err instanceof ApiClientError)) {
          reportError("trainer.exception.load", err);
        }
        setError(
          err instanceof ApiClientError
            ? err.message
            : "Could not load exception. (EXC-LOAD)",
        );
      }
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
      if (isNetworkFailure(err)) {
        setOffline(true);
      } else {
        if (!(err instanceof ApiClientError)) {
          reportError("trainer.exception.acknowledge", err);
        }
        setError(
          err instanceof ApiClientError
            ? err.message
            : "Could not acknowledge exception. (ACK-ERR)",
        );
      }
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
      if (isNetworkFailure(err)) {
        setResolveOpen(false);
        setOffline(true);
      } else {
        if (!(err instanceof ApiClientError)) {
          reportError("trainer.exception.resolve", err);
        }
        setResolveError(
          err instanceof ApiClientError
            ? err.message
            : "Could not resolve exception. (RES-ERR)",
        );
      }
    } finally {
      setActing(false);
    }
  }

  async function saveNote(input: NoteSaveInput) {
    if (!detail) return;
    setActing(true);
    setNoteError(null);
    setMessage(null);
    noteKey.current ??= createIdempotencyKey();
    try {
      await api.createTrainerNote(
        detail.coachingRelationshipId,
        input,
        noteKey.current,
      );
      noteKey.current = null;
      setNoteOpen(false);
      setMessage(
        input.visibility === "client"
          ? `Shared with ${firstNameOf(traineeName) || "client"}`
          : "Saved privately",
      );
    } catch (err) {
      if (isNetworkFailure(err)) {
        setNoteOpen(false);
        setOffline(true);
      } else {
        if (!(err instanceof ApiClientError)) {
          reportError("trainer.exception.note", err);
        }
        setNoteError(
          err instanceof ApiClientError
            ? err.message
            : "Could not save note. (NOTE-ERR)",
        );
      }
    } finally {
      setActing(false);
    }
  }

  if (notFound) {
    return (
      <Screen title="Exception" showHeader={false}>
        <View style={styles.gone}>
          <View style={styles.goneIcon}>
            <FileQuestion size={32} color={colors.indigo} strokeWidth={1.75} />
          </View>
          <Text style={styles.goneTitle}>This item is no longer available</Text>
          <Text style={styles.goneBody}>
            It may have been replaced by a plan change, so there's nothing to
            review here.
          </Text>
          <View style={styles.goneAction}>
            <PrimaryButton label="Back to Attention" onPress={onBack} />
          </View>
        </View>
      </Screen>
    );
  }

  const resolved = detail?.status === "resolved";
  const open =
    detail?.status === "detected" || detail?.status === "active";

  return (
    <Screen
      title="Exception"
      subtitle="Review the signal, then acknowledge or resolve. Plan edits stay on web."
      footer={
        <PrimaryButton label="Back to Attention" variant="ghost" onPress={onBack} />
      }
    >
      {detail && canAct ? (
        <View style={styles.moreRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More actions"
            onPress={() => setMoreOpen(true)}
            style={styles.more}
          >
            <Text style={styles.moreGlyph}>⋯</Text>
          </Pressable>
        </View>
      ) : null}
      {offline ? (
        <StateBanner
          tone="attention"
          Icon={WifiOff}
          text={offlineBannerText(detail ? lastUpdateAt : null, trainerZone)}
          actionLabel="Try again"
          onAction={() => {
            void load();
          }}
        />
      ) : null}
      {ended && detail ? (
        <StateBanner
          tone="neutral"
          Icon={Ban}
          text={endedBannerText(
            firstNameOf(traineeName),
            endedAt,
            trainerZone,
          )}
        />
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      {!detail ? (
        loading ? (
          <LoadingSkeleton />
        ) : null
      ) : (
        <View style={styles.stack}>
          {resolved ? (
            <StateBanner
              tone="positive"
              Icon={CircleCheck}
              text={resolvedBannerText(detail, trainerZone)}
            />
          ) : null}
          <View style={styles.banner}>
            <Text style={styles.meta}>
              {labelFor("exception_status", detail.status)} · {labelFor("exception_type", detail.type)}
            </Text>
            <Text style={styles.summary}>{detail.summary}</Text>
          </View>

          {open && canAct ? (
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
          ) : null}
          {open && offline && coaching === "active" ? (
            <PrimaryButton label="Acknowledge" disabled />
          ) : null}

          {detail.status === "acknowledged" && canAct ? (
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
          ) : null}
          {detail.status === "acknowledged" && offline && coaching === "active" ? (
            <PrimaryButton label="Resolve" disabled />
          ) : null}

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

          {!resolved && coaching === "active" ? (
            <PrimaryButton
              label="Nudge on WhatsApp"
              variant="ghost"
              disabled={!canAct}
              onPress={() => setNudgeOpen(true)}
            />
          ) : null}
          {coaching === "unknown" && !offline ? (
            <PrimaryButton
              label="Try again"
              variant="secondary"
              onPress={() => {
                void load();
              }}
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
          <MoreSheet
            visible={moreOpen}
            detail={detail}
            traineeDisplayName={traineeName}
            onDismiss={() => setMoreOpen(false)}
            onAddNote={() => {
              setMoreOpen(false);
              setNoteError(null);
              noteKey.current = null;
              setNoteOpen(true);
            }}
            onMessageOnWhatsApp={() => {
              setMoreOpen(false);
              setNudgeOpen(true);
            }}
          />
          <NoteSheet
            visible={noteOpen}
            traineeDisplayName={traineeName}
            trainerDisplayName={me?.trainerProfile?.displayName ?? null}
            acting={acting}
            errorMessage={noteError}
            onDismiss={() => setNoteOpen(false)}
            onSave={(input) => {
              void saveNote(input);
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

type BannerTone = "attention" | "neutral" | "positive";

function StateBanner({
  tone,
  Icon,
  text,
  actionLabel,
  onAction,
}: {
  tone: BannerTone;
  Icon: typeof Ban;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const palette = semanticColors[tone];
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.stateBanner,
        { backgroundColor: palette.fill, borderColor: `${palette.text}33` },
      ]}
    >
      <Icon size={20} color={palette.text} strokeWidth={1.75} />
      <View style={styles.stateBannerBody}>
        <Text style={[styles.stateBannerText, { color: palette.text }]}>
          {text}
        </Text>
        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            onPress={onAction}
            style={styles.stateBannerAction}
          >
            <Text style={[styles.stateBannerActionText, { color: palette.text }]}>
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Frame 38: placeholder cards while the exception loads. */
function LoadingSkeleton() {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading exception"
      style={styles.stack}
    >
      <View style={styles.skelCard}>
        <View style={[styles.skelBar, { width: "45%" }]} />
        <View style={[styles.skelBar, { width: "80%" }]} />
      </View>
      <View style={styles.skelCard}>
        <View style={[styles.skelBar, { width: "70%" }]} />
        <View style={[styles.skelBar, { width: "90%" }]} />
        <View style={[styles.skelBar, { width: "60%" }]} />
        <View style={[styles.skelBar, { width: "100%" }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stateBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  stateBannerBody: { flex: 1, gap: spacing.xs },
  stateBannerText: { fontSize: 15, lineHeight: 22 },
  stateBannerAction: {
    minHeight: 44,
    justifyContent: "center",
  },
  stateBannerActionText: { fontSize: 15, fontWeight: "600" },
  skelCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: spacing.lg,
    gap: spacing.md,
  },
  skelBar: {
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.lightGrey,
    opacity: 0.6,
  },
  gone: {
    alignItems: "center",
    gap: spacing.lg,
    paddingTop: spacing.xxxl,
  },
  goneAction: { alignSelf: "stretch" },
  goneIcon: {
    alignItems: "center",
    justifyContent: "center",
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: semanticColors.brandSelected.fill,
  },
  goneTitle: {
    color: colors.deepNavy,
    fontSize: 24,
    fontWeight: "600",
    textAlign: "center",
  },
  goneBody: {
    color: colors.midGrey,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  moreRow: { alignItems: "flex-end" },
  more: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTargetMin,
    minWidth: touchTargetMin,
  },
  moreGlyph: { color: colors.deepNavy, fontSize: 24, fontWeight: "600" },
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
