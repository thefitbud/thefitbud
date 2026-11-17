import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Bell, BellOff, Clock, Dumbbell, Moon, X } from "lucide-react-native";
import { ApiClientError } from "@fitbud/api-client";
import type {
  NudgeActivityRequest,
  NudgeActivityResponse,
  ResponsivenessResponse,
} from "@fitbud/contracts";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Field } from "../../components/Field";
import { Text } from "../../components/Text";
import { reportError } from "../../lib/reportError";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../../providers/ThemeProvider";
import { firstNameOf } from "./exceptionSheetContent";
import { NudgePickContent, type NudgePickItem } from "./NudgePickSheet";
import { isNetworkFailure } from "./exceptionStateContent";
import {
  NUDGE_BODY_MAX,
  NUDGE_CHIPS,
  bodyLooksLikeLink,
  nudgeChipBody,
  nudgeLimitLine,
  nudgeOutcome,
  nudgePreState,
  nudgeTargetSubtitle,
  pushOffLine,
  quietHoursLine,
  remindersPausedLine,
  type NudgeChip,
  type NudgePreState,
  type NudgeTarget,
} from "./nudgeContent";

/** The two API calls the sheet makes (the real client satisfies this). */
export type NudgeApi = {
  nudgeActivity(
    relationshipId: string,
    body: NudgeActivityRequest,
  ): Promise<NudgeActivityResponse>;
  getResponsiveness(
    relationshipId: string,
    days?: number,
  ): Promise<ResponsivenessResponse>;
};

type Props = {
  visible: boolean;
  /** The item to nudge about. Null with `pickItems`: pick one first (TM-03j), in this same sheet. */
  target: NudgeTarget | null;
  pickItems?: NudgePickItem[];
  traineeDisplayName: string;
  /** IANA zone of the client, for the quiet-hours check. */
  clientTimeZone: string | null;
  trainerDisplayName: string | null | undefined;
  api: NudgeApi;
  onDismiss: () => void;
  /** The nudge was sent (or held, or went to the inbox); `toast` is the TM-04m line. */
  onSent: (toast: string) => void;
};

/**
 * TM-04b / TM-04c / TM-04n / TM-04o (Z12-50, D-W12-9, D-W12-10): the nudge is
 * a FitBud push with the fixed title "{Coach} nudged you" and an editable
 * body. It never opens WhatsApp. The sheet follows the system theme itself, so
 * it reads right over a screen that has not migrated yet.
 */
export function NudgeSheet(props: Props) {
  return (
    <ThemeScope scheme="system" drivesSystemBars={false}>
      <NudgeSheetBody {...props} />
    </ThemeScope>
  );
}

function NudgeSheetBody({
  visible,
  target: givenTarget,
  pickItems,
  traineeDisplayName,
  clientTimeZone,
  trainerDisplayName,
  api,
  onDismiss,
  onSent,
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const first = firstNameOf(traineeDisplayName) || "your client";
  const coachFirst = firstNameOf(trainerDisplayName);
  const title = `${coachFirst || "Your coach"} nudged you`;

  const [picked, setPicked] = useState<NudgeTarget | null>(null);
  const target = givenTarget ?? picked;
  useEffect(() => {
    if (visible) setPicked(null);
  }, [visible]);

  const [chip, setChip] = useState<NudgeChip | null>("gentle");
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState(false);
  const [pre, setPre] = useState<NudgePreState>({ kind: "ready" });
  const [sending, setSending] = useState(false);
  const [limit, setLimit] = useState<string | null>(null);
  // TM-04n: the body of the nudge already sent today, shown instead of the draft.
  const [storedBody, setStoredBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sendingRef = useRef(false);

  const targetKey = target
    ? [target.relationshipId, target.activityType, target.activityId].join(":")
    : null;

  useEffect(() => {
    if (!visible || !target) return;
    setChip("gentle");
    setBody(nudgeChipBody("gentle", target));
    setEditing(false);
    setPre({ kind: "ready" });
    setSending(false);
    sendingRef.current = false;
    setLimit(null);
    setStoredBody(null);
    setError(null);
    let cancelled = false;
    void api
      .getResponsiveness(target.relationshipId, 14)
      .then((info) => {
        if (!cancelled) setPre(nudgePreState(info, clientTimeZone));
      })
      .catch((err: unknown) => {
        // Not blocking: the server still decides delivery and tells us after.
        reportError("trainer.nudge.responsiveness", err);
      });
    return () => {
      cancelled = true;
    };
    // The target's identity, not its object, restarts the sheet.
  }, [visible, targetKey]);

  if (!target) {
    if (!pickItems || pickItems.length === 0) return null;
    return (
      <BottomSheet visible={visible} headerless onDismiss={onDismiss}>
        <NudgePickContent
          traineeDisplayName={traineeDisplayName}
          items={pickItems}
          onNext={setPicked}
        />
      </BottomSheet>
    );
  }

  const trimmed = body.trim();
  const tooLong = trimmed.length > NUDGE_BODY_MAX;
  const hasLink = bodyLooksLikeLink(trimmed);
  const invalid = trimmed.length === 0 || tooLong || hasLink;
  const blocked = limit != null;

  function pickChip(next: NudgeChip) {
    if (!target) return;
    setChip(next);
    setBody(nudgeChipBody(next, target));
    setEditing(false);
    setError(null);
  }

  async function send() {
    if (!target || sendingRef.current || invalid || blocked) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      const result = await api.nudgeActivity(target.relationshipId, {
        activityType: target.activityType,
        activityId: target.activityId,
        body: trimmed,
      });
      const outcome = nudgeOutcome(result, first);
      if (outcome.kind === "limit") {
        setLimit(outcome.line);
        const stored = result.notification?.body;
        if (stored) setStoredBody(stored);
      } else {
        onSent(outcome.toast);
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === "NUDGE_LIMIT") {
          setLimit(nudgeLimitLine(first, null));
        } else {
          // The API's own curated message (static text).
          setError(err.message);
        }
      } else if (isNetworkFailure(err)) {
        setError("No connection. Try again when you're back online.");
      } else {
        reportError("trainer.nudge.send", err);
        setError("Could not send the nudge. (NUDGE-ERR)");
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  const notice: { Icon: typeof Moon; text: string; tone: "warn" | "neutral" } | null =
    limit
      ? { Icon: Clock, text: limit, tone: "neutral" }
      : pre.kind === "quiet_hours"
        ? { Icon: Moon, text: quietHoursLine(first, pre), tone: "warn" }
        : pre.kind === "push_off"
          ? { Icon: BellOff, text: pushOffLine(first), tone: "warn" }
          : pre.kind === "reminders_paused"
            ? {
                Icon: BellOff,
                text: remindersPausedLine(first),
                tone: "warn",
              }
            : null;
  const noticeInk = notice?.tone === "warn" ? theme.colors.warn : theme.colors.ink2;

  return (
    <BottomSheet visible={visible} headerless onDismiss={onDismiss}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="title" accessibilityRole="header">
            {`Nudge ${first}`}
          </Text>
          <Text variant="subhead">{nudgeTargetSubtitle(target)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onDismiss}
          style={styles.close}
        >
          <X size={20} color={theme.colors.ink} />
        </Pressable>
      </View>

      <View style={styles.chips}>
        {NUDGE_CHIPS.map((item) => (
          <Chip
            key={item.id}
            label={item.label}
            selected={chip === item.id}
            disabled={blocked}
            onPress={() => pickChip(item.id)}
            testID={`nudge-chip-${item.id}`}
          />
        ))}
      </View>

      <Text variant="label" style={styles.label}>
        PREVIEW · TAP TO EDIT
      </Text>
      {editing ? (
        <View>
          <Field
            label="Message"
            value={body}
            multiline
            autoFocus
            maxLength={NUDGE_BODY_MAX + 40}
            editable={!blocked}
            onChangeText={(value) => {
              setBody(value);
              setChip(null);
              setError(null);
            }}
            hint={
              hasLink
                ? "Nudges can't include links."
                : `${trimmed.length} of ${NUDGE_BODY_MAX}`
            }
            testID="nudge-body-input"
          />
          <Button
            label="Done"
            variant="text"
            size="sm"
            onPress={() => setEditing(false)}
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}. ${storedBody ?? body}. Tap to edit the message`}
          disabled={blocked}
          onPress={() => setEditing(true)}
          style={styles.preview}
          testID="nudge-preview"
        >
          <View style={styles.appIcon}>
            <Dumbbell size={22} color={theme.colors.onBrand} />
          </View>
          <View style={styles.previewText}>
            <View style={styles.previewHead}>
              <Text variant="bodyStrong" style={styles.previewTitle}>
                {title}
              </Text>
              <Text variant="caption">now</Text>
            </View>
            <Text variant="body">
              {storedBody ?? (trimmed || "Write a message")}
            </Text>
          </View>
        </Pressable>
      )}

      {notice ? (
        <View
          style={[
            styles.notice,
            notice.tone === "warn" ? styles.noticeWarn : styles.noticeNeutral,
          ]}
          accessibilityRole="summary"
          testID="nudge-notice"
        >
          <notice.Icon size={22} color={noticeInk} />
          <Text style={[styles.noticeText, { color: noticeInk }]}>
            {notice.text}
          </Text>
        </View>
      ) : null}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Button
        label="Send nudge"
        icon={
          <Bell
            size={22}
            color={blocked || invalid ? theme.colors.ink4 : theme.colors.onBrand}
          />
        }
        disabled={invalid || blocked}
        loading={sending}
        onPress={() => {
          void send();
        }}
        testID="nudge-send"
      />
      <Text variant="caption" style={styles.footnote}>
        {`Sends ${first} a push notification. It opens this item in FitBud.`}
      </Text>
    </BottomSheet>
  );
}

const useStyles = createThemedStyles((t) => ({
  header: { flexDirection: "row", alignItems: "flex-start", gap: t.spacing.md },
  headerText: { flex: 1, gap: t.spacing.xs },
  close: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 999,
    height: t.touchTarget,
    justifyContent: "center",
    width: t.touchTarget,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm },
  label: { marginTop: t.spacing.xs },
  preview: {
    alignItems: "flex-start",
    backgroundColor: t.colors.fill,
    borderRadius: t.radii.card,
    flexDirection: "row",
    gap: t.spacing.md,
    padding: t.spacing.md,
  },
  appIcon: {
    alignItems: "center",
    backgroundColor: t.colors.brand,
    borderRadius: 10,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  previewText: { flex: 1, gap: 2 },
  previewHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  previewTitle: { flexShrink: 1 },
  notice: {
    alignItems: "center",
    borderRadius: t.radii.card,
    flexDirection: "row",
    gap: t.spacing.md,
    padding: t.spacing.md,
  },
  noticeWarn: { backgroundColor: t.colors.warnTint },
  noticeNeutral: { backgroundColor: t.colors.fill },
  noticeText: { flex: 1, fontSize: 15, lineHeight: 21 },
  error: { color: t.colors.crit, fontSize: 14, lineHeight: 20 },
  footnote: { textAlign: "center" },
}));
