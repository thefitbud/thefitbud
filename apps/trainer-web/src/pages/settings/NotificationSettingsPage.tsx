import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError, userFacingMessage } from "@fitbud/api-client";
import { formatHhMmTime } from "@fitbud/core";
import { apiClient } from "../../lib/api";
import { useOnlineStatus } from "../../components/OfflineBanner";
import { Toggle } from "../../components/ui/Toggle";
import {
  ErrorState,
  LoadingBlock,
  errorKindFromFailure,
  type ErrorKind,
} from "../../components/StatePanels";
import {
  defaultTrainerCategories,
  type TrainerNotificationKey,
  type TrainerNotificationPrefs,
} from "../../lib/trainer-notification-prefs";
import { SettingsCard, SettingsRow } from "./SettingsLayout";
import "./settings.css";

/** Frame 177 rows mapped onto existing trainerCategories keys. */
const FRAME_ROWS: Array<{
  key: TrainerNotificationKey;
  label: string;
  description: string;
}> = [
  {
    key: "criticalDigest",
    label: "Clients who need you",
    description: "One summary at 9:00 am and when something turns critical.",
  },
  {
    key: "checkinSubmitted",
    label: "Check-ins submitted",
    description: "As they arrive.",
  },
  {
    // Z14-16 (D-W14-23 c): on by default; off means no push and no inbox row,
    // and the Edited/Removed tags still show in Activity.
    key: "clientLogEdits",
    label: "Client log edits",
    description: "When a client edits or removes a meal log.",
  },
  {
    key: "intakeSubmitted",
    label: "Intake submitted",
    description: "As they arrive.",
  },
  {
    key: "renewalsDue",
    label: "Renewals due",
    description: "3 days before and on the day.",
  },
  {
    key: "morningSummary",
    label: "Weekly summary email",
    description: "Mondays, 8:00 am.",
  },
];

const DEFAULT_QUIET_START = "22:00";
const DEFAULT_QUIET_END = "07:00";

function quietHoursLabel(start: string, end: string): string {
  return `${formatHhMmTime(start)} — ${formatHhMmTime(end)}`;
}

export function NotificationSettingsPage() {
  const online = useOnlineStatus();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [quietStart, setQuietStart] = useState(DEFAULT_QUIET_START);
  const [quietEnd, setQuietEnd] = useState(DEFAULT_QUIET_END);
  const [quietOn, setQuietOn] = useState(true);
  const [categories, setCategories] = useState<TrainerNotificationPrefs>(
    defaultTrainerCategories(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{
    message: string;
    kind: ErrorKind;
    requestId?: string | null;
  } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const skipPersist = useRef(true);
  const saveGen = useRef(0);
  const loadGen = useRef(0);

  const load = useCallback(async () => {
    if (!online) {
      setError({
        message: "You're offline. Reconnect to load notification settings.",
        kind: "network",
      });
      setLoading(false);
      return;
    }
    setLoading(true);
    const gen = ++loadGen.current;
    const savesAtStart = saveGen.current;
    try {
      const result = await apiClient.getNotificationPreferences();
      // A newer load or a save since this request started wins; applying this
      // response would revert the trainer's toggle and persist the old value.
      if (gen !== loadGen.current || saveGen.current !== savesAtStart) return;
      skipPersist.current = true;
      if (typeof result.pushEnabled === "boolean") {
        setPushEnabled(result.pushEnabled);
      }
      // Product default is quiet hours on (22:00–07:00). Null on the server
      // means "use the default", not "off" — matches frame 177 and prior TW-29.
      const start = result.quietHoursStart ?? DEFAULT_QUIET_START;
      const end = result.quietHoursEnd ?? DEFAULT_QUIET_END;
      setQuietStart(start);
      setQuietEnd(end);
      setQuietOn(true);
      if (result.trainerCategories) {
        setCategories({ ...defaultTrainerCategories(), ...result.trainerCategories });
      }
      setError(null);
    } catch (err) {
      if (gen !== loadGen.current) return;
      const apiErr = err instanceof ApiClientError ? err : null;
      setError({
        message:
          userFacingMessage(err, {
            fallback: "Could not load notification settings.",
          }),
        kind: errorKindFromFailure({
          status: apiErr?.status,
          code: apiErr?.code,
          message: apiErr?.message,
        }),
        requestId: apiErr?.requestId ?? null,
      });
    } finally {
      if (gen === loadGen.current) {
        setLoading(false);
        window.setTimeout(() => {
          skipPersist.current = false;
        }, 0);
      }
    }
  }, [online]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (
      next: {
        pushEnabled: boolean;
        quietOn: boolean;
        quietStart: string;
        quietEnd: string;
        categories: TrainerNotificationPrefs;
      },
      opts?: { force?: boolean },
    ) => {
      if ((!opts?.force && skipPersist.current) || !online) return;
      const gen = ++saveGen.current;
      setSaveError(null);
      setSaveStatus("saving");
      try {
        await apiClient.updateNotificationPreferences({
          pushEnabled: next.pushEnabled,
          quietHoursStart: next.quietOn ? next.quietStart : null,
          quietHoursEnd: next.quietOn ? next.quietEnd : null,
          trainerCategories: next.categories,
        });
        if (gen === saveGen.current) setSaveStatus("saved");
      } catch (err) {
        if (gen === saveGen.current) {
          setSaveStatus("idle");
          setSaveError(
            userFacingMessage(err, { fallback: "Could not save notification settings." }),
          );
        }
      }
    },
    [online],
  );

  function toggleCategory(key: TrainerNotificationKey) {
    setCategories((current) => {
      const next = { ...current, [key]: !current[key] };
      skipPersist.current = false;
      void persist(
        {
          pushEnabled,
          quietOn,
          quietStart,
          quietEnd,
          categories: next,
        },
        { force: true },
      );
      return next;
    });
  }

  function toggleQuietHours() {
    setQuietOn((current) => {
      const next = !current;
      skipPersist.current = false;
      void persist(
        {
          pushEnabled,
          quietOn: next,
          quietStart,
          quietEnd,
          categories,
        },
        { force: true },
      );
      return next;
    });
  }

  if (loading) return <LoadingBlock label="Loading notifications…" />;

  if (error) {
    return (
      <div data-testid="screen-TW-29">
        <ErrorState
          message={userFacingMessage(error)}
          kind={error.kind}
          requestId={error.requestId}
          screenId="TW-29"
          onRetry={() => void load()}
        />
      </div>
    );
  }

  const quietDesc = quietOn
    ? `${quietHoursLabel(quietStart, quietEnd)} • nothing during these hours.`
    : "Off — alerts can arrive any time.";
  const pushRows = FRAME_ROWS.filter((item) => item.key !== "morningSummary");
  const emailRows = FRAME_ROWS.filter((item) => item.key === "morningSummary");

  return (
    <div className="settings-stack" data-testid="screen-TW-29">
      {!online ? (
        <p className="form-error settings-banner" role="status">
          You&apos;re offline. Changes will save when you reconnect.
        </p>
      ) : null}

      <SettingsCard title="Push to your phone" aside="Push to your phone and this browser.">
        {pushRows.map((item) => (
          <SettingsRow
            key={item.key}
            label={item.label}
            labelId={`notif-label-${item.key}`}
            help={item.description}
            inline
          >
            <Toggle
              checked={categories[item.key] ?? true}
              disabled={!online}
              labelledBy={`notif-label-${item.key}`}
              onChange={() => toggleCategory(item.key)}
            />
          </SettingsRow>
        ))}
      </SettingsCard>

      <SettingsCard title="Email digest">
        {emailRows.map((item) => (
          <SettingsRow
            key={item.key}
            label={item.label}
            labelId={`notif-label-${item.key}`}
            help={item.description}
            inline
          >
            <Toggle
              checked={categories[item.key] ?? true}
              disabled={!online}
              labelledBy={`notif-label-${item.key}`}
              onChange={() => toggleCategory(item.key)}
            />
          </SettingsRow>
        ))}
      </SettingsCard>

      <SettingsCard title="Quiet hours" aside="No pushes to you or your clients">
        <SettingsRow
          label="Quiet hours"
          labelId="notif-label-quiet"
          help={quietDesc}
          helpTestId="quiet-hours-display"
          inline
        >
          <Toggle
            checked={quietOn}
            disabled={!online}
            labelledBy="notif-label-quiet"
            onChange={() => toggleQuietHours()}
          />
        </SettingsRow>
      </SettingsCard>

      {saveStatus === "saved" && !saveError ? (
        <p className="settings-note" role="status" data-testid="notification-prefs-saved">
          Saved
        </p>
      ) : null}
      {saveError ? (
        <p className="form-error" role="alert">
          {saveError}
        </p>
      ) : null}
    </div>
  );
}
