import type { ReactNode } from "react";
import { Button } from "./Button";

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  requestId,
  screenId = "TW-33",
  supportEmail = "tech@thefitbud.com",
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  requestId?: string | null;
  screenId?: string;
  supportEmail?: string;
}) {
  const mailto = (() => {
    const subject = encodeURIComponent(
      `FitBud support · Trainer web · ${screenId}`,
    );
    const body = encodeURIComponent(
      `\n\n---\nApp: Trainer web\nScreen: ${screenId}\nRequest id: ${requestId ?? "n/a"}\nLocal time: ${new Date().toISOString()}`,
    );
    return `mailto:${supportEmail}?subject=${subject}&body=${body}`;
  })();

  return (
    <div className="state-panel is-error" role="alert" data-testid="error-state">
      <h2>{title}</h2>
      <p>{message}</p>
      <div className="button-row" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {onRetry ? (
          <Button variant="primary" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
        {requestId ? (
          <details>
            <summary>Details</summary>
            <p className="muted">Request id: {requestId}</p>
          </details>
        ) : null}
        <a className="button-secondary" href={mailto}>
          Email support
        </a>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="state-panel is-empty" data-testid="empty-state">
      <h2>{title}</h2>
      {children ? <div className="state-panel-body">{children}</div> : null}
      {action}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="muted loading-block" aria-busy="true">
      {label}
    </p>
  );
}

export function ForbiddenState({
  title = "You don't have access to this client",
  message = "This client belongs to another coach, or the link is no longer valid.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div
      className="state-panel is-error"
      role="alert"
      data-testid="forbidden-state"
    >
      <h2>{title}</h2>
      <p>{message}</p>
      <a className="button-primary" href="/">
        Back to Home
      </a>
    </div>
  );
}
