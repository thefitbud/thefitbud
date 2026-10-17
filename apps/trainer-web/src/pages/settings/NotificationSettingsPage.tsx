import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "@fitbud/api-client";
import { apiClient } from "../../lib/api";
import { LoadingBlock } from "../../components/StatePanels";

export function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.getNotificationPreferences();
      setPrefs(result as Record<string, unknown>);
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

  if (loading) return <LoadingBlock />;
  if (error) return <p className="form-error" role="alert">{error}</p>;

  return (
    <div className="settings-panel">
      <h2>Trainer notifications</h2>
      <p className="muted">
        Choose which coaching events notify you in the app.
      </p>
      <pre className="prefs-debug">{JSON.stringify(prefs, null, 2)}</pre>
    </div>
  );
}
