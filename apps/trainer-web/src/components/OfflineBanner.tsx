import { useOnline } from "../hooks/useOnline";

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      You&apos;re offline. Some actions are unavailable until you reconnect.
    </div>
  );
}
