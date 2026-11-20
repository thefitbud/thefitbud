import { useEffect } from "react";

type Props = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  /** Sheet and inline confirmation. Fixed toasts dismiss after 5 seconds. */
  inline?: boolean;
};

export function Toast({ message, actionLabel, onAction, onDismiss, inline = false }: Props) {
  useEffect(() => {
    if (inline || !onDismiss) return;
    const timer = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(timer);
  }, [inline, onDismiss]);

  return (
    <div className={`ui-toast${inline ? " is-inline" : ""}`} role="status">
      <span>{message}</span>
      {actionLabel ? (
        <button type="button" className="ui-toast-act" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
