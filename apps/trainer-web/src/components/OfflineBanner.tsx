import { useOnline } from "../hooks/useOnline";

/** Shared online/offline status for disabling mutating actions. */
export function useOnlineStatus(): boolean {
  return useOnline();
}

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="offline-banner" role="status" data-testid="offline-banner">
      You&apos;re offline. Changes can&apos;t be saved.
    </div>
  );
}
