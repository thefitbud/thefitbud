import type { ReactNode } from "react";
import {
  USER_FACING_OFFLINE,
  USER_FACING_SERVER,
  isTechnicalErrorMessage,
  userFacingMessage,
} from "@fitbud/api-client";
import { CloudAlert, Lock, Mail, SearchX } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "./Button";
import "./StatePanels.css";

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
    title: "Couldn't load this page",
    message: USER_FACING_OFFLINE,
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
    title: "Couldn't load this page",
    message: USER_FACING_SERVER,
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
  if (!message || isTechnicalErrorMessage(message)) {
    return ERROR_COPY[kind].message;
  }
  return userFacingMessage(message, { fallback: ERROR_COPY[kind].message });
}

function supportMailto(input: {
  supportEmail: string;
  screenId: string;
  errorKind: string;
  requestId: string;
}): string {
  const subject = encodeURIComponent(
    `FitBud support · Trainer web · ${input.screenId}`,
  );
  const body = encodeURIComponent(
    `\n\n---\nApp: Trainer web\nScreen: ${input.screenId}\nError: ${input.errorKind}\nRequest id: ${input.requestId}\nLocal time: ${new Date().toISOString()}`,
  );
  return `mailto:${input.supportEmail}?subject=${subject}&body=${body}`;
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
  const mailto = supportMailto({
    supportEmail,
    screenId,
    errorKind: resolvedKind,
    requestId: resolvedRequestId,
  });

  return (
    <div
      className="state-panel state-card is-error"
      role="alert"
      data-testid="error-state"
      data-error-kind={resolvedKind}
    >
      <span className="state-card-icon is-error" aria-hidden="true">
        <CloudAlert size={28} strokeWidth={1.75} />
      </span>
      <h2>{resolvedTitle}</h2>
      <p>{resolvedMessage}</p>
      <div className="state-card-actions">
        {onRetry ? (
          <Button variant="primary" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
        <a className="button-secondary" href={mailto}>
          <Mail size={16} aria-hidden="true" />
          Email support
        </a>
      </div>
      <details className="state-card-details">
        <summary>Details</summary>
        <p className="muted">Request id: {resolvedRequestId}</p>
      </details>
    </div>
  );
}

export function NotFoundState({
  title = "We couldn't find that",
  message = "The link may be old, or the client was removed. Check the address or go back to your clients.",
  clientsHref = "/clients",
}: {
  title?: string;
  message?: string;
  clientsHref?: string;
}) {
  return (
    <div
      className="state-panel state-card"
      role="status"
      data-testid="not-found-state"
    >
      <span className="state-card-icon is-neutral" aria-hidden="true">
        <SearchX size={28} strokeWidth={1.75} />
      </span>
      <h2>{title}</h2>
      <p>{message}</p>
      <div className="state-card-actions">
        <Link className="button-primary" to={clientsHref}>
          Go to Clients
        </Link>
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
  message = "This client belongs to another coach. If you think this is wrong, email us.",
  clientsHref = "/clients",
  supportEmail = "tech@thefitbud.com",
  screenId = "TW-33",
}: {
  title?: string;
  message?: string;
  clientsHref?: string;
  supportEmail?: string;
  screenId?: string;
}) {
  const mailto = supportMailto({
    supportEmail,
    screenId,
    errorKind: "forbidden",
    requestId: "n/a",
  });

  return (
    <div
      className="state-panel state-card"
      role="alert"
      data-testid="forbidden-state"
    >
      <span className="state-card-icon is-lock" aria-hidden="true">
        <Lock size={28} strokeWidth={1.75} />
      </span>
      <h2>{title}</h2>
      <p>{message}</p>
      <div className="state-card-actions">
        <Link className="button-primary" to={clientsHref}>
          Go to Clients
        </Link>
        <a className="button-secondary" href={mailto}>
          <Mail size={16} aria-hidden="true" />
          Email support
        </a>
      </div>
    </div>
  );
}
