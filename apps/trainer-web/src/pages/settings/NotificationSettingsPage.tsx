import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "@fitbud/api-client";
import { apiClient } from "../../lib/api";
import { LoadingBlock } from "../../components/StatePanels";
import {
  loadTrainerNotificationPrefs,
  saveTrainerNotificationPrefs,
  TRAINER_NOTIFICATION_META,
  type TrainerNotificationPrefs,
} from "../../lib/trainer-notification-prefs";

export function NotificationSettingsPage() {
  const [pushEnabled, setPushEnabled] = useState(true);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("07:00");
  const [categories, setCategories] = useState<TrainerNotificationPrefs>(
    loadTrainerNotificationPrefs(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.getNotificationPreferences();
      if (typeof result.pushEnabled === "boolean") {
        setPushEnabled(result.pushEnabled);
      }
      if (result.quietHoursStart) setQuietStart(result.quietHoursStart);
      if (result.quietHoursEnd) setQuietEnd(result.quietHoursEnd);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load notification settings.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setError(null);
    setMessage(null);
    try {
      await apiClient.updateNotificationPreferences({
        pushEnabled,
        quietHoursStart: quietStart,
        quietHoursEnd: quietEnd,
      });
      saveTrainerNotificationPrefs(categories);
      setMessage("Notification settings saved.");
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not save notification settings.",
      );
    }
  }

  function toggleCategory(key: keyof TrainerNotificationPrefs) {
    setCategories((current) => {
      const next = { ...current, [key]: !current[key] };
      saveTrainerNotificationPrefs(next);
      return next;
    });
  }

  if (loading) return <LoadingBlock />;

  return (
    <div className="settings-panel stack-lg">
      <h2>Trainer notifications</h2>
      <p className="muted">
        Choose which coaching events notify you in the app. Web bell is always on;
        mobile push follows your phone settings.
      </p>
      <p className="muted" role="note">
        Turn on notifications in the FitBud app on your phone if push is off.
      </p>
      <ul className="notification-category-list">
        {TRAINER_NOTIFICATION_META.map((item) => (
          <li key={item.key}>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={categories[item.key]}
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
      <fieldset className="field">
        <legend>Quiet hours</legend>
        <p className="muted">Trainer push is held during quiet hours (your timezone).</p>
        <div className="quiet-hours-row">
          <label>
            <span>From</span>
            <input
              type="time"
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="time"
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
            />
          </label>
        </div>
      </fieldset>
      <label className="switch-row">
        <input
          type="checkbox"
          checked={pushEnabled}
          onChange={(e) => setPushEnabled(e.target.checked)}
        />
        Mobile push enabled
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="form-success" role="status">{message}</p> : null}
      <button type="button" className="button-primary" onClick={() => void save()}>
        Save
      </button>
    </div>
  );
}
