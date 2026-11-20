import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { useDialog } from "./useDialog";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: "md" | "lg";
  children: ReactNode;
  footer?: ReactNode;
};

/** Centred modal. 560 standard, 720 large. Esc and scrim click close. */
export function Modal({ open, onClose, title, subtitle, size = "md", children, footer }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(open, onClose, ref);
  if (!open) return null;

  return createPortal(
    <div className="ui-scrim" onMouseDown={onClose}>
      <div
        ref={ref}
        className={`ui-modal${size === "lg" ? " is-lg" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ui-modal-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="ui-modal-h">
          <div className="ui-ttl">
            <h2 id="ui-modal-title" className="ui-t-modal">
              {title}
            </h2>
            {subtitle ? <p className="ui-sub">{subtitle}</p> : null}
          </div>
          <Button variant="secondary" icon aria-label="Close" onClick={onClose}>
            <X className="ui-i" strokeWidth={1.75} aria-hidden />
          </Button>
        </header>
        <div className="ui-modal-b">{children}</div>
        {footer ? <footer className="ui-modal-f">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
