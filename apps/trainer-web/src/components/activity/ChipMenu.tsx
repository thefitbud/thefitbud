import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

export type ChipMenuOption = { value: string; label: string };

type Props = {
  /** Small label before the value, e.g. "Status". */
  label?: string;
  /** Leading icon (a 14 px lucide icon). */
  icon?: ReactNode;
  /** Text shown on the chip: the selected option's label unless overridden. */
  valueLabel?: string;
  options: ChipMenuOption[];
  value: string;
  onChange: (value: string) => void;
  "aria-label": string;
  /** Open the menu from the right edge (for chips at the end of a toolbar). */
  alignEnd?: boolean;
  testId?: string;
};

/**
 * The v3 dropdown chip (DS filter chips: "Owner Anyone v"): one button that
 * opens a short list of choices. Escape and an outside click close it.
 */
export function ChipMenu({
  label,
  icon,
  valueLabel,
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
  alignEnd = false,
  testId,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="chip-menu" ref={rootRef} data-testid={testId}>
      <button
        ref={buttonRef}
        type="button"
        className="ui-chip chip-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${ariaLabel}: ${valueLabel ?? selected?.label ?? ""}`}
        onClick={() => setOpen((current) => !current)}
      >
        {icon}
        {label ? <span>{label}</span> : null}
        <b>{valueLabel ?? selected?.label ?? ""}</b>
        <ChevronDown className="ui-i" aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={ariaLabel}
          className={alignEnd ? "chip-menu-list is-end" : "chip-menu-list"}
        >
          {options.map((option) => (
            <button
              key={option.value || "any"}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              className={
                option.value === value ? "chip-menu-item is-on" : "chip-menu-item"
              }
              onClick={() => {
                setOpen(false);
                onChange(option.value);
                buttonRef.current?.focus();
              }}
            >
              <span>{option.label}</span>
              {option.value === value ? (
                <Check className="ui-i" aria-hidden="true" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
