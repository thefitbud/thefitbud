import { AlertCircle, WifiOff } from "lucide-react";
import type { ReactNode } from "react";

type ErrorProps = {
  children: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
};

/** Quiet crit banner. Reassures first. Details stay out of the sentence. */
export function ErrorState({ children, onRetry, retryLabel = "Try again" }: ErrorProps) {
  return (
    <div className="ui-banner ui-b-crit" role="alert">
      <AlertCircle className="ui-i" strokeWidth={1.75} aria-hidden />
      <div>
        {children}{" "}
        {onRetry ? (
          <button type="button" className="ui-retry" onClick={onRetry}>
            {retryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function OfflineBanner({ children }: { children: ReactNode }) {
  return (
    <div className="ui-banner ui-b-neutral" role="status">
      <WifiOff className="ui-i" strokeWidth={1.75} aria-hidden />
      <div>{children}</div>
    </div>
  );
}
