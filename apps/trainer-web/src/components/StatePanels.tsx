import type { ReactNode } from "react";
import { Button } from "./Button";

/** TW-33 error kinds from api-client status/code mapping. */
export type ErrorKind =
  | "network"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "server";

const ERROR_COPY: Record<ErrorKind, { title: string; message: string }> = {
  network: {
    title: "Connection problem",
    message: "Check your network and try again. Your session is still signed in.",
  },
  unauthorized: {
    title: "Please sign in again",
    message: "Your session expired. Sign in to continue.",
  },
  forbidden: {
    title: "You don't have access",
    message:
      "This client belongs to another coach, or the link is no longer valid.",
  },
  notFound: {
    title: "We couldn't find that",
    message: "This link may be outdated, or the item was removed.",
  },
  conflict: {
    title: "This changed elsewhere",
    message: "Reload to see the latest, then try again.",
  },
  server: {
    title: "Something went wrong",
    message: "Please retry in a moment. If it keeps happening, email support.",
  },
};

export function errorKindFromFailure(input: {
  status?: number;
  code?: string;
  message?: string;
}): ErrorKind {
  const status = input.status ?? 0;
  const code = (input.code ?? "").toUpperCase();
  if (
    status === 0 ||
    code === "NETWORK_ERROR" ||
    /failed to fetch|networkerror|load failed/i.test(input.message ?? "")
  ) {
    return "network";
  }
  if (status === 401 || code === "UNAUTHORIZED") return "unauthorized";
  if (status === 403 || code === "FORBIDDEN") return "forbidden";
  if (status === 404 || code === "NOT_FOUND") return "notFound";
  if (status === 409 || code === "CONFLICT") return "conflict";
  return "server";
}

function sanitizeMessage(message: string | undefined, kind: ErrorKind): string {
  if (!message || /Request failed with status/i.test(message)) {
    return ERROR_COPY[kind].message;
  }
  return message;
}

export function ErrorState({
  title,
  message,
  kind,
  onRetry,
  requestId,
  screenId = "TW-33",
  supportEmail = "tech@thefitbud.com",
}: {
  title?: string;
  message?: string;
  kind?: ErrorKind;
  onRetry?: () => void;
  requestId?: string | null;
  screenId?: string;
  supportEmail?: string;
}) {
  const resolvedKind =
    kind ??
    errorKindFromFailure({
      message,
    });
  const copy = ERROR_COPY[resolvedKind];
  const resolvedTitle = title ?? copy.title;
  const resolvedMessage = sanitizeMessage(message, resolvedKind);
  const resolvedRequestId = requestId?.trim() || "n/a";

  const mailto = (() => {
    const subject = encodeURIComponent(
      `FitBud support · Trainer web · ${screenId}`,
    );
    const body = encodeURIComponent(
      `\n\n---\nApp: Trainer web\nScreen: ${screenId}\nError: ${resolvedKind}\nRequest id: ${resolvedRequestId}\nLocal time: ${new Date().toISOString()}`,
    );
    return `mailto:${supportEmail}?subject=${subject}&body=${body}`;
  })();

  return (
    <div
      className="state-panel is-error"
      role="alert"
      data-testid="error-state"
      data-error-kind={resolvedKind}
    >
      <h2>{resolvedTitle}</h2>
      <p>{resolvedMessage}</p>
      <div
        className="button-row"
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        {onRetry ? (
          <Button variant="primary" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
        <details>
          <summary>Details</summary>
          <p className="muted">Request id: {resolvedRequestId}</p>
        </details>
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
