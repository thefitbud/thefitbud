import { useCallback, useEffect, useState } from "react";
import { Pressable } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import {
  formatCivilDate,
  formatLocalDate,
  formatPersonName,
  zonedDateTimeFormat,
} from "@fitbud/core";
import { useAuth } from "../../auth/AuthProvider";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Text } from "../../components/Text";
import { reportError } from "../../lib/reportError";
import { M2Group, M2Page, M2Row, M2Section } from "./m2";

type Props = {
  onBack: () => void;
  onOpenPassword: () => void;
  onOpenPrivacy: () => void;
  onOpenLanguage: () => void;
  onOpenPastCoaching: () => void;
};

/** A readable name for an IANA zone ("India Standard Time"). */
export function zoneName(zone: string | null | undefined): string {
  if (!zone || zone === "Asia/Kolkata" || zone === "Asia/Calcutta") {
    return "India Standard Time";
  }
  if (zone === "Asia/Dubai") return "Gulf Standard Time";
  try {
    const name = zonedDateTimeFormat("en-IN", {
      timeZone: zone,
      timeZoneName: "long",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    if (name && !/GMT|UTC/i.test(name)) return name;
  } catch (err) {
    reportError("zoneName", err);
  }
  return "Your time zone";
}

function civilFromIso(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatCivilDate(formatLocalDate(date, timeZone));
}

/**
 * TR-20c Account (Z12-49 layout). Sign-in rows, then the settings that left
 * More's root in v3: time zone, language, privacy and past coaching. The
 * mock's "Download my data" has no backend source and is not shown; "Delete
 * account" and its footnote are Z12-29's (D-W12-25).
 */
export function AccountScreen({
  onBack,
  onOpenPassword,
  onOpenPrivacy,
  onOpenLanguage,
  onOpenPastCoaching,
}: Props) {
  const { api, me } = useAuth();
  const timeZone = me?.timezone || "Asia/Kolkata";
  const [zone, setZone] = useState(timeZone);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [pastHint, setPastHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [prefs, rels] = await Promise.all([
        api.getNotificationPreferences(),
        api.listRelationships({ limit: 50 }),
      ]);
      if (prefs.traineeTimezone) setZone(prefs.traineeTimezone);
      const ended = rels.items.filter((row) => row.status === "ended");
      if (ended.length === 0) {
        setPastHint(null);
        return;
      }
      const latest = [...ended].sort((a, b) =>
        (b.endedAt ?? "").localeCompare(a.endedAt ?? ""),
      )[0]!;
      const who = formatPersonName(latest.trainerDisplayName?.trim() || "Previous coach");
      const start = civilFromIso(latest.startedAt, timeZone);
      const end = civilFromIso(latest.endedAt, timeZone);
      setPastHint(start && end ? `${who} · ${start} – ${end}` : who);
    } catch (err) {
      reportError("AccountScreen.load", err);
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't load your account settings (ACCT-LOAD). Pull to try again.",
      );
    }
  }, [api, timeZone]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveZone(next: string) {
    const previous = zone;
    setZone(next);
    setZoneOpen(false);
    try {
      await api.updateNotificationPreferences({ traineeTimezone: next });
    } catch (err) {
      reportError("AccountScreen.saveZone", err);
      setZone(previous);
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't save your time zone (ACCT-TZ). Try again.",
      );
    }
  }

  return (
    <M2Page title="Account" onBack={onBack} testID="account">
      {error ? <ErrorBanner message={error} /> : null}
      <M2Section label="Sign-in" />
      <M2Group>
        <M2Row label="Email" hint={me?.email ?? "Not set"} />
        <M2Row label="Password" hint="Change your password" onPress={onOpenPassword} />
      </M2Group>

      <M2Section label="Preferences" />
      <M2Group>
        <M2Row
          label="Time zone"
          hint={`${zoneName(zone)} · reminders and dates use it`}
          showChevron={false}
          trailing={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change time zone"
              onPress={() => setZoneOpen(true)}
              style={{ justifyContent: "center", minHeight: 44, paddingHorizontal: 2 }}
            >
              <Text tone="brand" style={{ fontSize: 16, fontWeight: "600" }}>
                Change
              </Text>
            </Pressable>
          }
        />
        <M2Row label="Language" value="English" onPress={onOpenLanguage} />
      </M2Group>

      <M2Section label="Your data" />
      <M2Group>
        <M2Row label="Privacy" hint="What your coach can see" onPress={onOpenPrivacy} />
        {pastHint ? (
          <M2Row label="Past coaching" hint={pastHint} onPress={onOpenPastCoaching} />
        ) : null}
      </M2Group>

      <BottomSheet
        visible={zoneOpen}
        title="Time zone"
        subtitle="From your phone, unless you change it."
        onDismiss={() => setZoneOpen(false)}
      >
        <Button
          label="India Standard Time"
          variant="secondary"
          onPress={() => {
            void saveZone("Asia/Kolkata");
          }}
        />
        <Button
          label="Gulf Standard Time"
          variant="secondary"
          style={{ marginTop: 8 }}
          onPress={() => {
            void saveZone("Asia/Dubai");
          }}
        />
      </BottomSheet>
    </M2Page>
  );
}
