import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { useDialog } from "./useDialog";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
};

/** Docked right panel. 540px, the width the live home panel already uses. */
export function SidePanel({ open, onClose, title, children, footer }: Props) {
  const ref = useRef<HTMLElement>(null);
  useDialog(open, onClose, ref);
  if (!open) return null;

  return createPortal(
    <aside
      ref={ref}
      className="ui-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ui-panel-title"
      tabIndex={-1}
    >
      <header className="ui-modal-h">
        <div className="ui-ttl">
          <h2 id="ui-panel-title" className="ui-t-modal">
            {title}
          </h2>
        </div>
        <Button variant="secondary" icon aria-label="Close panel" onClick={onClose}>
          <X className="ui-i" strokeWidth={1.75} aria-hidden />
        </Button>
      </header>
      <div className="ui-modal-b">{children}</div>
      {footer ? <footer className="ui-modal-f">{footer}</footer> : null}
    </aside>,
    document.body,
  );
}
