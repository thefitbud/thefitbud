/**
 * Shared chrome for the trainer's meal and measurement log (Z10-19): the DS8 d
 * header, 7-day strip, ended state (d5), not-saved box (d4), save button
 * (d3) and the save/retry rules. Z10-16's `../model` supplies the strip and the
 * network check; nothing there is changed.
 */
import { useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AlertCircle, CalendarDays, ChevronLeft, Clock, Lock } from "lucide-react-native";
import { ApiClientError } from "@fitbud/api-client";
import { formatCivilDate } from "@fitbud/core";
import { colors, fontFamilySemiBold, spacing } from "@fitbud/ui-mobile";
import { Text } from "../../../components/Text";
import { createIdempotencyKey } from "../../../lib/idempotency";
import { dayOfMonth, weekdayShort } from "../../../lib/dates";
import { reportError } from "../../../lib/reportError";
import { isNetworkError } from "../model";

export const NETWORK_COPY =
  "Not saved. We couldn’t reach FitBud, so nothing was saved. Your entries are still here. Check your connection and try again.";

export type SaveState =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "failed"; message: string; stale: boolean };

/**
 * Save with one idempotency key per logical entry: kept after a network
 * failure or 5xx (the write may have landed, a retry replays it), replaced
 * after a 4xx (a definite refusal) and by `newEntry()`.
 */
export function useLogSave(scope: string) {
  const [save, setSave] = useState<SaveState>({ state: "idle" });
  const key = useRef(createIdempotencyKey());
  function newEntry() {
    key.current = createIdempotencyKey();
    setSave({ state: "idle" });
  }
  async function run(send: (idempotencyKey: string) => Promise<string>, onSaved: (m: string) => void) {
    setSave({ state: "saving" });
    try {
      onSaved(await send(key.current));
    } catch (err) {
      if (isNetworkError(err)) {
        setSave({ state: "failed", message: NETWORK_COPY, stale: false });
        return;
      }
      reportError(scope, err);
      if (err instanceof ApiClientError) {
        if (err.status >= 400 && err.status < 500) key.current = createIdempotencyKey();
        setSave({
          state: "failed",
          message: `Not saved. ${err.message} Your entries are still here.`,
          stale: err.code === "VERSION_CONFLICT",
        });
      } else {
        setSave({
          state: "failed",
          message: "Not saved. Something went wrong. Your entries are still here. LOG-SAVE",
          stale: false,
        });
      }
    }
  }
  return { save, setSave, newEntry, run };
}

export function LogHeader({ title, name, onBack }: { title: string; name: string; onBack: () => void }) {
  return (
    <View style={styles.head}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.backHit}>
        <ChevronLeft color={colors.deepNavy} size={26} />
      </Pressable>
      <View style={styles.headTx}>
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        <Text style={styles.subtitle}>{name}</Text>
      </View>
      <View style={styles.backHit} />
    </View>
  );
}

export function EndedView({
  header,
  first,
  noun,
  onBack,
}: {
  header: ReactNode;
  first: string;
  noun: string;
  onBack: () => void;
}) {
  return (
    <>
      {header}
      <View style={styles.center}>
        <View style={[styles.badge, styles.badgeGrey]}>
          <Lock color={colors.deepNavy} size={26} />
        </View>
        <Text style={styles.centerTitle}>Coaching with {first} has ended</Text>
        <Text style={styles.centerBody}>
          Ended clients are read-only, so you can’t log {noun} for them. Reactivate coaching from
          their client page to log again.
        </Text>
        <Pressable accessibilityRole="button" onPress={onBack} style={[styles.outlined, styles.centered]}>
          <Text style={styles.outlinedText}>Open {first}’s page</Text>
        </Pressable>
      </View>
    </>
  );
}

export function DateStrip({
  strip,
  date,
  zone,
  noun,
  onPick,
}: {
  strip: string[];
  date: string;
  zone: string;
  noun: string;
  onPick: (d: string) => void;
}) {
  const earliest = strip[0]!;
  return (
    <>
      <Text style={styles.label}>Date · up to 7 days back</Text>
      <View style={styles.strip}>
        {strip.map((d) => {
          const on = d === date;
          return (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityLabel={formatCivilDate(d)}
              accessibilityState={{ selected: on }}
              onPress={() => onPick(d)}
              style={[styles.chip, on ? styles.chipOn : null]}
            >
              <Text style={styles.chipDow}>{weekdayShort(zone, d)}</Text>
              <Text style={styles.chipDay}>{dayOfMonth(zone, d)}</Text>
            </Pressable>
          );
        })}
      </View>
      {date === earliest ? (
        <View style={styles.note}>
          <CalendarDays color={colors.deepNavy} size={22} />
          <Text style={styles.noteText}>
            You can log up to 7 days back, so {formatCivilDate(earliest)} is the earliest. Older{" "}
            {noun} can’t be added.
          </Text>
        </View>
      ) : null}
    </>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <View style={styles.errBox} accessibilityRole="alert">
      <AlertCircle color={colors.error} size={22} />
      <Text style={styles.errText}>{message}</Text>
    </View>
  );
}

export function SaveButton({
  save,
  canSave,
  idleLabel,
  onPress,
}: {
  save: SaveState;
  canSave: boolean;
  idleLabel: string;
  onPress: () => void;
}) {
  const label =
    save.state === "saving" ? "Saving…" : save.state === "failed" && !save.stale ? "Try again" : idleLabel;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !canSave, busy: save.state === "saving" }}
      disabled={!canSave}
      onPress={onPress}
      style={[styles.saveBtn, save.state === "saving" ? styles.saveBusy : null, !canSave && save.state !== "saving" ? styles.saveOff : null]}
    >
      {save.state === "saving" ? <Clock color={colors.white} size={20} /> : null}
      <Text style={styles.saveText}>{label}</Text>
    </Pressable>
  );
}

export function ReloadButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.outlined}>
      <Text style={styles.outlinedText}>Reload entry</Text>
    </Pressable>
  );
}

export const shared = StyleSheet.create({
  label: {
    color: colors.midGrey,
    fontSize: 13,
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  labelGap: { marginTop: spacing.lg },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  rowCard: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 64 },
  flex: { flex: 1, minWidth: 0 },
  cardTitle: { color: colors.deepNavy, fontFamily: fontFamilySemiBold, fontSize: 18, fontWeight: "500" },
  cardSub: { color: colors.midGrey, fontSize: 15, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  pill: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 22,
    borderWidth: 1.5,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  pillOn: { backgroundColor: "#F9F7FF", borderColor: colors.indigo, borderWidth: 2.5 },
  pillOff: { opacity: 0.45 },
  pillText: { color: colors.deepNavy, fontSize: 16, fontWeight: "600" },
  input: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 14,
    borderWidth: 1.5,
    color: colors.deepNavy,
    fontSize: 18,
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  inputMulti: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: "top" },
});

const styles = StyleSheet.create({
  head: { alignItems: "center", flexDirection: "row", marginBottom: spacing.md },
  backHit: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  headTx: { alignItems: "center", flex: 1 },
  title: { color: colors.deepNavy, fontFamily: fontFamilySemiBold, fontSize: 20, fontWeight: "600" },
  subtitle: { color: colors.midGrey, fontSize: 15, fontWeight: "600", marginTop: 2 },
  label: shared.label,
  strip: { flexDirection: "row", gap: 6 },
  chip: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 16,
    borderWidth: 1.5,
    flex: 1,
    justifyContent: "center",
    minHeight: 64,
  },
  chipOn: { backgroundColor: "#F9F7FF", borderColor: colors.indigo, borderWidth: 2.5 },
  chipDow: { color: colors.midGrey, fontSize: 13 },
  chipDay: { color: colors.deepNavy, fontSize: 20, fontWeight: "500", marginTop: 2 },
  note: {
    alignItems: "flex-start",
    backgroundColor: "#F3F4F6",
    borderColor: colors.lightGrey,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  noteText: { color: colors.deepNavy, flex: 1, fontSize: 15, lineHeight: 21 },
  outlined: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 22,
    borderWidth: 1.5,
    justifyContent: "center",
    marginTop: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.xl,
  },
  centered: { alignSelf: "center" },
  outlinedText: { color: colors.deepNavy, fontSize: 17, fontWeight: "600" },
  errBox: {
    alignItems: "flex-start",
    backgroundColor: "#FEF1F1",
    borderColor: "#F9C9C9",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  errText: { color: colors.error, flex: 1, fontSize: 15, lineHeight: 22 },
  saveBtn: {
    alignItems: "center",
    backgroundColor: colors.indigo,
    borderRadius: 28,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 56,
  },
  saveBusy: { backgroundColor: "#7C68D6" },
  saveOff: { opacity: 0.45 },
  saveText: { color: colors.white, fontSize: 18, fontWeight: "600" },
  center: { alignItems: "center", paddingTop: 80 },
  badge: { alignItems: "center", borderRadius: 44, height: 88, justifyContent: "center", width: 88 },
  badgeGrey: { backgroundColor: "#F3F4F6" },
  centerTitle: { color: colors.deepNavy, fontSize: 24, marginTop: spacing.lg, textAlign: "center" },
  centerBody: { color: colors.midGrey, fontSize: 17, lineHeight: 25, marginTop: spacing.md, textAlign: "center" },
});
