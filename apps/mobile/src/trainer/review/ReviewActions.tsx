import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import {
  Bell,
  Check,
  Eye,
  MessageCircle,
  NotebookPen,
} from "lucide-react-native";
import { Button } from "../../components/Button";
import { Text } from "../../components/Text";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";

export type ReviewActionsState = "open" | "noted" | "resolved" | "ended";

type Props = {
  state: ReviewActionsState;
  /** The client's first name, for "Remind {first}". */
  firstName: string;
  /** Only some exception types can be reminded. */
  remindable: boolean;
  /** Offline or a call in flight. */
  disabled?: boolean;
  acting?: boolean;
  /** "Noted · still open" or the resolved line; shown for noted and resolved. */
  stateLine?: string | null;
  onRemind: () => void;
  onNoted: () => void;
  onResolve: () => void;
  /** Present only where an Undo exists. */
  onUndo?: (() => void) | undefined;
  onAddNote: () => void;
  onWhatsApp: () => void;
  /** testID prefix: "review-sheet" or "exception". */
  testIdPrefix: string;
};

export function remindLabel(firstName: string): string {
  return firstName ? `Remind ${firstName}` : "Remind client";
}

/**
 * One action set for the review sheet and the exception screen (D-W14-29).
 * Open: Remind, Noted keep open, Resolve… (primary). Noted: a state line with
 * Undo, Remind, Resolve… (primary). Resolved and ended: read only. Add note
 * and WhatsApp are two small text actions under the card while the item is
 * live. No caption, no ⋯ menu.
 */
export function ReviewActions({
  state,
  firstName,
  remindable,
  disabled = false,
  acting = false,
  stateLine,
  onRemind,
  onNoted,
  onResolve,
  onUndo,
  onAddNote,
  onWhatsApp,
  testIdPrefix,
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const live = state === "open" || state === "noted";
  const iconInk = disabled ? theme.colors.ink4 : theme.colors.ink;
  const remind = remindable ? (
    <Button
      label={remindLabel(firstName)}
      variant="secondary"
      icon={<Bell size={18} strokeWidth={1.75} color={iconInk} />}
      disabled={disabled}
      onPress={onRemind}
      style={styles.half}
      testID={`${testIdPrefix}-remind`}
    />
  ) : null;
  return (
    <View testID={`${testIdPrefix}-actions`}>
      {state === "noted" || state === "resolved" ? (
        <StateLine
          resolved={state === "resolved"}
          text={stateLine ?? ""}
          disabled={disabled}
          onUndo={onUndo}
          testIdPrefix={testIdPrefix}
        />
      ) : null}

      {state === "open" ? (
        <>
          <View style={styles.row}>
            {remind}
            <Button
              label="Noted, keep open"
              variant="tint"
              disabled={disabled}
              loading={acting}
              onPress={onNoted}
              style={styles.half}
              testID={`${testIdPrefix}-noted`}
            />
          </View>
          <Button
            label="Resolve…"
            variant="primary"
            disabled={disabled}
            onPress={onResolve}
            style={styles.resolve}
            testID={`${testIdPrefix}-resolve`}
          />
        </>
      ) : null}

      {state === "noted" ? (
        <View style={styles.row}>
          {remind}
          <Button
            label="Resolve…"
            variant="primary"
            disabled={disabled}
            onPress={onResolve}
            style={styles.half}
            testID={`${testIdPrefix}-resolve`}
          />
        </View>
      ) : null}

      {live ? (
        <View style={styles.textRow}>
          <TextAction
            label="Add note"
            icon={
              <NotebookPen
                size={18}
                color={theme.colors.ink}
                strokeWidth={1.75}
              />
            }
            disabled={disabled}
            onPress={onAddNote}
            testID={`${testIdPrefix}-add-note`}
          />
          <TextAction
            label="WhatsApp"
            icon={
              <MessageCircle
                size={18}
                color={theme.colors.ink}
                strokeWidth={1.75}
              />
            }
            onPress={onWhatsApp}
            testID={`${testIdPrefix}-whatsapp`}
          />
        </View>
      ) : null}
    </View>
  );
}

function StateLine({
  resolved,
  text,
  disabled,
  onUndo,
  testIdPrefix,
}: {
  resolved: boolean;
  text: string;
  disabled: boolean;
  onUndo?: (() => void) | undefined;
  testIdPrefix: string;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const ink = resolved ? theme.colors.done : theme.colors.ink2;
  const Icon = resolved ? Check : Eye;
  return (
    <View
      style={[
        styles.stateLine,
        {
          backgroundColor: resolved ? theme.colors.doneTint : theme.colors.fill,
        },
      ]}
      accessibilityLabel={text}
      testID={`${testIdPrefix}-state-line`}
    >
      <Icon color={ink} size={16} strokeWidth={2.25} />
      <Text variant="body" style={[styles.stateText, { color: ink }]}>
        {text}
      </Text>
      {onUndo ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Undo"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onUndo}
          style={styles.undoHit}
          testID={`${testIdPrefix}-undo`}
        >
          <Text
            variant="bodyStrong"
            style={[{ color: ink }, disabled ? styles.dim : null]}
          >
            Undo
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function TextAction({
  label,
  icon,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.textAction, disabled ? styles.dim : null]}
      testID={testID}
    >
      {icon}
      <Text variant="bodyStrong">{label}</Text>
    </Pressable>
  );
}

const useStyles = createThemedStyles((t) => ({
  row: { flexDirection: "row", gap: t.spacing.sm, marginTop: t.spacing.xs },
  half: { flex: 1, paddingHorizontal: 10 },
  resolve: { marginTop: t.spacing.sm },
  stateLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.spacing.sm,
    borderRadius: 12,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.xs,
    minHeight: t.touchTarget,
  },
  stateText: { flex: 1 },
  undoHit: {
    minHeight: t.touchTarget,
    justifyContent: "center",
    paddingLeft: t.spacing.sm,
  },
  dim: { opacity: 0.4 },
  textRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: t.spacing.lg,
    marginTop: t.spacing.xs,
  },
  textAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.spacing.xs,
    minHeight: t.touchTarget,
    paddingHorizontal: t.spacing.sm,
  },
}));
