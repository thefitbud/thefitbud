import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  ChevronLeft,
  CircleCheck,
  CloudAlert,
  CloudOff,
  CloudUpload,
  GitCompareArrows,
  RefreshCw,
} from "lucide-react-native";
import type { ColorToken } from "@fitbud/tokens";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../../components/Button";
import { Text } from "../../components/Text";
import { reportError } from "../../lib/reportError";
import { liveActivityKeptRows } from "../../notifications/liveActivityOutbox";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../../providers/ThemeProvider";
import { useSyncEngine } from "../../sync/SyncProvider";
import type { SendOutcome } from "../../sync/engine";
import {
  NO_SHEET_NAMES,
  SHEET_EMPTY_BODY,
  SHEET_FAILED_BODY,
  SHEET_WAITING_BODY,
  conflictSheetCopy,
  createKeptRowsBinding,
  lastSentLabel,
  resolvedSyncNotes,
  sendOutcomeLine,
  sheetItems,
  sheetTitle,
  type SheetItem,
  type SheetNames,
} from "../../sync/outboxCopy";
import { useSyncView } from "../../sync/useSyncStatus";

/**
 * Sets tapped on the lock screen (iOS Live Activity) or in the notification
 * shade (Android) that the drain kept because no workout was running. Bound
 * once, at module scope, so the screen reads the live store rather than a copy
 * taken when it mounted.
 */
const keptRows = createKeptRowsBinding(liveActivityKeptRows);

/**
 * Late workout writes settled rather than refused (Z14-8, D-W14-12): a set
 * that arrived after the workout ended, a skip of a finished workout. Shown
 * as what happened, never as "Couldn't send".
 */
const resolvedLines = {
  subscribe: (onChange: () => void) => resolvedSyncNotes.subscribe(onChange),
  snapshot: () => resolvedSyncNotes.lines(),
};

type ContentProps = {
  coachName?: string;
  /** "See {coach}'s change" on a conflict; defaults to closing the screen. */
  onSeeChange?: () => void;
};

type Props = ContentProps & {
  onBack: () => void;
};

/**
 * Sync status (TR-19a) and the plan-change conflict (TR-19b), Z12-41.
 *
 * Everything shown is the outbox's real state, read through `useSyncView`:
 * the lines are the rows waiting, sending or refused, and a row the server
 * accepted is simply no longer there. Nothing here keeps its own idea of
 * whether the phone is online.
 *
 * The mock presents this as a sheet over More. The trainee shell mounts it as
 * a screen, so `SyncStatusScreen` is that screen and `SyncStatusContent` is
 * the mock's content on its own, ready to be put in a sheet.
 */
export function SyncStatusScreen({ onBack, coachName, onSeeChange }: Props) {
  return (
    <ThemeScope scheme="system">
      <ScreenBody
        onBack={onBack}
        coachName={coachName}
        onSeeChange={onSeeChange ?? onBack}
      />
    </ThemeScope>
  );
}

function ScreenBody({ onBack, coachName, onSeeChange }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.pageContent}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.back}
        >
          <ChevronLeft color={theme.colors.ink2} size={20} strokeWidth={1.75} />
          <Text variant="body" tone="ink2">
            Back
          </Text>
        </Pressable>
        <SyncStatusContent coachName={coachName} onSeeChange={onSeeChange} />
      </ScrollView>
    </SafeAreaView>
  );
}

type RecordPayload = Record<string, unknown>;

function parse(json: string | null): RecordPayload | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as unknown;
    return value && typeof value === "object" ? (value as RecordPayload) : null;
  } catch {
    return null;
  }
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/**
 * Meal and workout names for the lines, from the records already on the
 * phone. A name that is not there is left to the plain fallback ("Meal",
 * "Workout"): nothing is fetched for this screen and nothing is invented.
 */
function useSheetNames(): SheetNames {
  const sync = useSyncEngine();
  const [names, setNames] = useState<SheetNames>(NO_SHEET_NAMES);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [meals, assignments, executions] = await Promise.all([
          sync.store.listLocal("meal_assignment"),
          sync.store.listLocal("workout_assignment"),
          sync.store.listLocal("workout_execution"),
        ]);
        const mealNames = new Map<string, string>();
        for (const row of meals) {
          const name = str(parse(row.payloadJson)?.mealName);
          if (name) mealNames.set(row.recordId, name);
        }
        const workoutNames = new Map<string, string>();
        for (const row of assignments) {
          const body = parse(row.payloadJson);
          const day = body?.workoutDay as RecordPayload | undefined;
          const name = str(body?.workoutDayName) ?? str(day?.name);
          if (name) workoutNames.set(row.recordId, name);
        }
        for (const row of executions) {
          const assignmentId = str(parse(row.payloadJson)?.assignmentId);
          const name = assignmentId ? workoutNames.get(assignmentId) : undefined;
          if (name) workoutNames.set(row.recordId, name);
        }
        if (active) {
          setNames({
            meal: (id) => mealNames.get(id) ?? null,
            workout: (id) => workoutNames.get(id) ?? null,
          });
        }
      } catch (error) {
        reportError("SyncStatus.names", error);
      }
    })();
    return () => {
      active = false;
    };
  }, [sync]);
  return names;
}

const CHIPS: Record<
  SheetItem["state"],
  { fill: ColorToken; ink: ColorToken; label: string }
> = {
  waiting: { fill: "warnTint", ink: "warn", label: "Saved on phone" },
  sending: { fill: "infoTint", ink: "info", label: "Sending…" },
  failed: { fill: "critTint", ink: "crit", label: "Couldn't send" },
};

function StateChip({ item }: { item: SheetItem }) {
  const theme = useTheme();
  const styles = useStyles();
  const chip = CHIPS[item.state];
  const label = item.conflict && item.kept ? "Kept on phone" : chip.label;
  const color = theme.colors[chip.ink];
  const Icon =
    item.state === "sending"
      ? CloudUpload
      : item.state === "failed"
        ? CloudAlert
        : CloudOff;
  return (
    <View style={[styles.chip, { backgroundColor: theme.colors[chip.fill] }]}>
      <Icon color={color} size={15} strokeWidth={2} />
      <Text variant="caption" style={[styles.chipLabel, { color }]}>
        {label}
      </Text>
    </View>
  );
}

export function SyncStatusContent({
  coachName = "your coach",
  onSeeChange,
}: ContentProps) {
  const theme = useTheme();
  const styles = useStyles();
  const sync = useSyncEngine();
  const { me } = useAuth();
  const view = useSyncView();
  const names = useSheetNames();
  const coachFirstName = coachName.split(/\s+/)[0] || "Your coach";
  const timeZone = me?.timezone ?? undefined;
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);
  /** Conflicts closed with "See change" in this visit; they stay on the list. */
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const [openConflict, setOpenConflict] = useState<string | null>(null);
  const keptRowsCopy = useSyncExternalStore(
    keptRows.subscribe,
    keptRows.snapshot,
    keptRows.snapshot,
  );
  const settledLines = useSyncExternalStore(
    resolvedLines.subscribe,
    resolvedLines.snapshot,
    resolvedLines.snapshot,
  );

  const items = useMemo(
    () =>
      view
        ? sheetItems(view.rows, { names, coachFirstName, timeZone })
        : [],
    [view, names, coachFirstName, timeZone],
  );

  // A plan-change conflict the trainee has not answered opens on its own.
  const pending = items.find(
    (item) => item.conflict && !item.kept && !seen.has(item.key),
  );
  const conflict =
    items.find((item) => item.key === openConflict && item.conflict) ??
    pending ??
    null;

  async function trySendingNow() {
    setSending(true);
    setOutcome(null);
    try {
      setOutcome(await sync.sendNow());
    } finally {
      setSending(false);
    }
  }

  function closeConflict(item: SheetItem) {
    setSeen((current) => new Set(current).add(item.key));
    setOpenConflict(null);
  }

  if (!view) {
    // The outbox could not be read. That is not "nothing waiting".
    return (
      <View style={styles.content}>
        <Text variant="title" accessibilityRole="header">
          Sync status
        </Text>
        <Text variant="body" tone="ink2">
          Couldn't read what's saved on this phone (SYNC-STORE). Close this and
          open it again.
        </Text>
      </View>
    );
  }

  const open = items.filter((item) => item.state !== "failed").length;
  const quiet = items.length === 0;
  const resultLine = outcome ? sendOutcomeLine(outcome) : null;
  const lastSent = lastSentLabel(view.status.lastSentAt, timeZone);
  const HeaderIcon = quiet ? CloudUpload : open > 0 ? CloudOff : CloudAlert;
  const headerTone: ColorToken = quiet ? "done" : open > 0 ? "warn" : "crit";

  return (
    <View style={styles.content}>
      <View style={styles.header}>
        <HeaderIcon
          color={theme.colors[headerTone]}
          size={26}
          strokeWidth={2}
        />
        <Text variant="title" accessibilityRole="header" style={styles.title}>
          {sheetTitle(items)}
        </Text>
      </View>
      <Text variant="body" tone="ink2">
        {quiet
          ? SHEET_EMPTY_BODY
          : open > 0
            ? SHEET_WAITING_BODY
            : SHEET_FAILED_BODY}
      </Text>

      {keptRowsCopy ? (
        // Announced when a drain makes it appear: the trainee would otherwise
        // never learn that a lock-screen set is being held.
        <View accessibilityLiveRegion="polite" style={styles.note}>
          <Text variant="subhead">{keptRowsCopy}</Text>
        </View>
      ) : null}

      {settledLines.map((line) => (
        // Settled, nothing to do: a plain note, not a refusal (Z14-8).
        <View
          key={line}
          accessibilityLiveRegion="polite"
          style={[styles.note, styles.settledNote]}
        >
          <CircleCheck color={theme.colors.done} size={18} strokeWidth={2} />
          <Text variant="subhead" style={styles.settledText}>
            {line}
          </Text>
        </View>
      ))}

      {items.length > 0 ? (
        <View style={styles.group}>
          {items.map((item, index) => (
            <View
              key={item.key}
              style={[styles.row, index > 0 ? styles.rowDivider : null]}
            >
              <View style={styles.rowTop}>
                <View style={styles.rowText}>
                  <Text variant="bodyStrong">{item.title}</Text>
                  <Text variant="subhead">{item.detail}</Text>
                </View>
                <StateChip item={item} />
              </View>
              {item.state === "failed" ? (
                <View style={styles.failed}>
                  {item.reason ? (
                    <Text variant="subhead" tone="crit">
                      {item.reason}
                    </Text>
                  ) : null}
                  <View style={styles.actions}>
                    {item.conflict ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        label="What changed"
                        accessibilityLabel={`What changed for ${item.title}`}
                        onPress={() => setOpenConflict(item.key)}
                      />
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        label="Try again"
                        accessibilityLabel={`Try again: ${item.title}`}
                        disabled={sending}
                        onPress={() => {
                          void (async () => {
                            for (const id of item.mutationIds) {
                              await sync.retryEntry(id);
                            }
                            await trySendingNow();
                          })();
                        }}
                      />
                    )}
                    <Button
                      size="sm"
                      variant="text"
                      label="Remove"
                      accessibilityLabel={`Remove ${item.title} from this phone`}
                      onPress={() => {
                        void (async () => {
                          for (const id of item.mutationIds) {
                            await sync.discardEntry(id);
                          }
                        })();
                      }}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <Button
        variant="tint"
        label={sending ? "Sending…" : "Try sending now"}
        loading={sending}
        disabled={open === 0}
        icon={
          <RefreshCw
            color={open === 0 ? theme.colors.ink4 : theme.colors.brandInk}
            size={18}
            strokeWidth={2}
          />
        }
        onPress={() => {
          void trySendingNow();
        }}
      />
      <View accessibilityLiveRegion="polite" style={styles.footer}>
        {resultLine ? (
          <Text variant="subhead" style={styles.center}>
            {resultLine}
          </Text>
        ) : null}
        {lastSent ? (
          <Text variant="caption" style={styles.center}>
            {lastSent}
          </Text>
        ) : null}
      </View>

      {conflict ? (
        <ConflictDialog
          item={conflict}
          coachFirstName={coachFirstName}
          onKeep={() => {
            void (async () => {
              for (const id of conflict.mutationIds) await sync.keepEntry(id);
              closeConflict(conflict);
            })();
          }}
          onSee={() => {
            closeConflict(conflict);
            onSeeChange?.();
          }}
        />
      ) : null}
    </View>
  );
}

/** TR-19b: the coach changed the plan while the log waited on the phone. */
function ConflictDialog({
  item,
  coachFirstName,
  onKeep,
  onSee,
}: {
  item: SheetItem;
  coachFirstName: string;
  onKeep: () => void;
  onSee: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const named = item.title !== "Meal" && item.title !== "Workout";
  const copy = conflictSheetCopy({
    coachFirstName,
    kind: item.kind,
    subject: item.kind === "meal" && named ? item.title.toLowerCase() : null,
  });
  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onSee}
    >
      <View style={styles.scrim} accessibilityViewIsModal>
        <View style={styles.dialog} accessibilityRole="alert">
          <View style={styles.dialogIcon}>
            <GitCompareArrows
              color={theme.colors.info}
              size={26}
              strokeWidth={2}
            />
          </View>
          <Text variant="headline" accessibilityRole="header" style={styles.center}>
            {copy.title}
          </Text>
          <Text variant="body" tone="ink2" style={styles.center}>
            {copy.body}
          </Text>
          <View style={styles.dialogActions}>
            <Button label={copy.keep} onPress={onKeep} />
            <Button variant="secondary" label={copy.see} onPress={onSee} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createThemedStyles((t) => ({
  page: {
    backgroundColor: t.colors.bg,
    flex: 1,
  },
  pageContent: {
    gap: t.spacing.md,
    padding: t.spacing.lg,
    paddingBottom: t.spacing.xxl,
  },
  back: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 2,
    minHeight: t.touchTarget,
  },
  content: {
    gap: t.spacing.md,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: t.spacing.sm,
  },
  title: {
    flex: 1,
  },
  note: {
    backgroundColor: t.colors.fill,
    borderRadius: t.radii.group,
    padding: t.spacing.md,
  },
  settledNote: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: t.spacing.sm,
  },
  settledText: {
    flex: 1,
  },
  group: {
    backgroundColor: t.scheme === "dark" ? t.colors.card : t.colors.fill,
    borderRadius: t.radii.group,
    paddingHorizontal: t.spacing.lg,
  },
  row: {
    gap: t.spacing.sm,
    paddingVertical: t.spacing.md,
  },
  rowDivider: {
    borderTopColor: t.colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: t.spacing.md,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  chip: {
    alignItems: "center",
    borderRadius: t.radii.pill,
    flexDirection: "row",
    gap: 5,
    height: 30,
    paddingHorizontal: 10,
  },
  chipLabel: {
    fontWeight: "600",
  },
  failed: {
    gap: t.spacing.sm,
  },
  actions: {
    flexDirection: "row",
    gap: t.spacing.sm,
  },
  footer: {
    gap: t.spacing.xs,
    minHeight: 20,
  },
  center: {
    textAlign: "center",
  },
  scrim: {
    alignItems: "center",
    backgroundColor: t.colors.scrim,
    flex: 1,
    justifyContent: "center",
    padding: t.spacing.xl,
  },
  dialog: {
    alignItems: "stretch",
    backgroundColor: t.colors.card,
    borderColor: t.colors.edge,
    borderRadius: t.radii.dialog,
    borderWidth: t.scheme === "dark" ? 1 : 0,
    gap: t.spacing.md,
    maxWidth: 420,
    padding: t.spacing.xl,
    width: "100%",
  },
  dialogIcon: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: t.colors.infoTint,
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  dialogActions: {
    gap: t.spacing.sm,
    marginTop: t.spacing.xs,
  },
}));
