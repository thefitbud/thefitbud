import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type OverflowMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

type Props = {
  items: OverflowMenuItem[];
  label?: string;
  className?: string;
};

/** Web ⋯ overflow menu for secondary actions (P4 / foundations). */
export function OverflowMenu({
  items,
  label = "More actions",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(ev: MouseEvent) {
      if (!rootRef.current?.contains(ev.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== "Escape") return;
      // Keep parent drawers open when closing this menu.
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div className={`overflow-menu ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        className="overflow-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open ? (
        <ul id={menuId} role="menu" className="overflow-menu-list">
          {items.map((item) => (
            <li key={item.id} role="none">
              <button
                type="button"
                role="menuitem"
                className={
                  item.destructive
                    ? "overflow-menu-item overflow-menu-item-destructive"
                    : "overflow-menu-item"
                }
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export type { ReactNode };
