import { useEffect, useRef, useState } from "react";
import { WifiOff } from "lucide-react";
import { formatClockTime } from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { useOnline } from "../hooks/useOnline";
import "./OfflineBanner.css";

/** Shared online/offline status for disabling mutating actions. */
export function useOnlineStatus(): boolean {
  return useOnline();
}

/**
 * Frame 186: amber banner with wifi-off icon and
 * "You're offline. Showing what was loaded at {time}. Changes can't be saved until you're back online."
 *
 * `loadedAt` freezes at the last moment we were online (content still on screen).
 */
export function OfflineBanner({
  loadedAt: loadedAtProp,
}: {
  /** Optional override for tests / captures. */
  loadedAt?: Date | string | null;
} = {}) {
  const online = useOnlineStatus();
  const { me } = useAuth();
  const timezone = me?.timezone;
  const loadedAtRef = useRef<Date>(new Date());
  const [loadedAt, setLoadedAt] = useState<Date>(() => new Date());

  useEffect(() => {
    if (loadedAtProp != null) {
      const next =
        typeof loadedAtProp === "string"
          ? new Date(loadedAtProp)
          : loadedAtProp;
      if (!Number.isNaN(next.getTime())) {
        loadedAtRef.current = next;
        setLoadedAt(next);
      }
      return;
    }
    if (online) {
      const now = new Date();
      loadedAtRef.current = now;
      setLoadedAt(now);
    }
  }, [online, loadedAtProp]);

  if (online) return null;

  const clock = formatClockTime(loadedAtRef.current ?? loadedAt, timezone);
  const timeLabel = clock || formatClockTime(new Date(), timezone);

  return (
    <div
      className="fb-offline-banner"
      role="status"
      data-testid="offline-banner"
    >
      <span className="fb-offline-banner-icon" aria-hidden="true">
        <WifiOff size={16} strokeWidth={1.75} />
      </span>
      <p className="fb-offline-banner-copy">
        You&apos;re offline. Showing what was loaded at {timeLabel}. Changes
        can&apos;t be saved until you&apos;re back online.
      </p>
    </div>
  );
}
