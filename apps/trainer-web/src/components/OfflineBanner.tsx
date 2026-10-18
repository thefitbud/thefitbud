import { useOnline } from "../hooks/useOnline";

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="offline-banner" role="status" data-testid="offline-banner">
      You&apos;re offline. Changes can&apos;t be saved.
    </div>
  );
}
