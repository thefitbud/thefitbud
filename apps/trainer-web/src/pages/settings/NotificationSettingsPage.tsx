import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "@fitbud/api-client";
import { formatHhMmTime } from "@fitbud/core";
import { apiClient } from "../../lib/api";
import { useOnlineStatus } from "../../components/OfflineBanner";
import {
  ErrorState,
  LoadingBlock,
  errorKindFromFailure,
  type ErrorKind,
} from "../../components/StatePanels";
import {
  defaultTrainerCategories,
  TRAINER_NOTIFICATION_META,
  type TrainerNotificationPrefs,
} from "../../lib/trainer-notification-prefs";

export function NotificationSettingsPage() {
  const online = useOnlineStatus();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("07:00");
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
  const persistTimer = useRef<number | null>(null);
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
      if (result.quietHoursStart) setQuietStart(result.quietHoursStart);
      if (result.quietHoursEnd) setQuietEnd(result.quietHoursEnd);
      if (result.trainerCategories) {
        setCategories(result.trainerCategories);
      }
      setError(null);
    } catch (err) {
      if (gen !== loadGen.current) return;
      const apiErr = err instanceof ApiClientError ? err : null;
      setError({
        message:
          apiErr?.message ?? "Could not load notification settings.",
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
          quietHoursStart: next.quietStart,
          quietHoursEnd: next.quietEnd,
          trainerCategories: next.categories,
        });
        if (gen === saveGen.current) setSaveStatus("saved");
      } catch (err) {
        if (gen === saveGen.current) {
          setSaveStatus("idle");
          setSaveError(
            err instanceof ApiClientError
              ? err.message
              : "Could not save notification settings.",
          );
        }
      }
    },
    [online],
  );

  useEffect(() => {
    if (skipPersist.current) return;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      void persist({ pushEnabled, quietStart, quietEnd, categories });
    }, 300);
    return () => {
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
    };
  }, [pushEnabled, quietStart, quietEnd, categories, persist]);

  function toggleCategory(key: keyof TrainerNotificationPrefs) {
    setCategories((current) => {
      const next = { ...current, [key]: !current[key] };
      // Force persist now — do not race skipPersist from the initial load.
      skipPersist.current = false;
      void persist(
        {
          pushEnabled,
          quietStart,
          quietEnd,
          categories: next,
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
          message={error.message}
          kind={error.kind}
          requestId={error.requestId}
          screenId="TW-29"
          onRetry={() => void load()}
        />
      </div>
    );
  }

  return (
    <div className="settings-panel stack-lg" data-testid="screen-TW-29">
      <h2>Notifications</h2>
      <p className="muted">
        Choose which coaching events notify you. Critical and meal-time alerts
        merge into at most one push every 15 minutes.
      </p>

      {!online ? (
        <p className="form-error" role="status">
          You&apos;re offline. Changes will save when you reconnect.
        </p>
      ) : null}

      <section aria-labelledby="notification-channels-heading">
        <h3 id="notification-channels-heading">Channels</h3>
        <ul className="notification-category-list">
          <li>
            <label className="switch-row">
              <input type="checkbox" checked disabled readOnly />
              <span>
                <strong>Web bell</strong>
                <span className="muted block">
                  Always on in trainer web while you&apos;re signed in.
                </span>
              </span>
            </label>
          </li>
          <li>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={pushEnabled}
                disabled={!online}
                onChange={(e) => setPushEnabled(e.target.checked)}
              />
              <span>
                <strong>Mobile push</strong>
                <span className="muted block">
                  When the FitBud trainer app is installed on your phone.
                </span>
              </span>
            </label>
          </li>
        </ul>
        <p className="muted" role="note">
          Turn on notifications in the FitBud app on your phone if push is off.
        </p>
      </section>

      <section aria-labelledby="notification-categories-heading">
        <h3 id="notification-categories-heading">Categories</h3>
        <ul className="notification-category-list">
          {TRAINER_NOTIFICATION_META.map((item) => (
            <li key={item.key}>
              <label className="switch-row">
                <input
                  type="checkbox"
                  checked={categories[item.key]}
                  disabled={!online}
                  onChange={() => toggleCategory(item.key)}
                />
                <span>
                  <strong>{item.label}</strong>
                  <span className="muted block">{item.description}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <fieldset className="field">
        <legend>Quiet hours</legend>
        <p className="muted">
          Trainer push is held during quiet hours (your timezone). Default{" "}
          {formatHhMmTime("22:00")} – {formatHhMmTime("07:00")}.
        </p>
        <p className="quiet-hours-display" aria-live="polite">
          {formatHhMmTime(quietStart)} – {formatHhMmTime(quietEnd)}
        </p>
        <div className="quiet-hours-row">
          <label>
            <span>From</span>
            <input
              type="time"
              value={quietStart}
              disabled={!online}
              onChange={(e) => setQuietStart(e.target.value)}
            />
            <span className="muted">{formatHhMmTime(quietStart)}</span>
          </label>
          <label>
            <span>To</span>
            <input
              type="time"
              value={quietEnd}
              disabled={!online}
              onChange={(e) => setQuietEnd(e.target.value)}
            />
            <span className="muted">{formatHhMmTime(quietEnd)}</span>
          </label>
        </div>
      </fieldset>

      {saveStatus === "saved" && !saveError ? (
        <p className="muted" role="status" data-testid="notification-prefs-saved">
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
