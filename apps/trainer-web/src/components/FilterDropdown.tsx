import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Check, ChevronDown } from "lucide-react";

export type FilterOption = {
  value: string;
  label: string;
  /** Facet count from the directory response; omitted when unknown. */
  count?: number;
};

export type FilterDropdownProps = {
  label: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  /** Clears this one filter (all selected values). */
  onClear: () => void;
};

/**
 * Text shown on the closed button. Selection is always in words, never colour
 * alone: "Status", "Status: Invited", "Status: Invited +1".
 */
export function filterDropdownSummary(
  label: string,
  options: FilterOption[],
  selected: string[],
): string {
  if (selected.length === 0) return label;
  const first = selected[0] as string;
  const firstLabel =
    options.find((option) => option.value === first)?.label ?? first;
  const rest = selected.length - 1;
  return rest > 0 ? `${label}: ${firstLabel} +${rest}` : `${label}: ${firstLabel}`;
}

/**
 * One Clients-list filter (D-W8-13): an outlined button that opens a menu of
 * checkable options. Multi-select; each pick calls `onToggle` and the menu
 * stays open. Enter/Space/ArrowDown opens, arrows/Home/End move, Escape closes
 * and returns focus to the button, Tab closes.
 */
export function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef<"first" | "last" | null>(null);
  const baseId = useId();
  const menuId = `${baseId}-menu`;
  const summary = filterDropdownSummary(label, options, selected);
  const selectedLabels = selected.map(
    (value) => options.find((option) => option.value === value)?.label ?? value,
  );
  const fullSelection =
    selected.length > 1 ? `${label}: ${selectedLabels.join(", ")}` : undefined;

  function items(): HTMLElement[] {
    return Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>("[data-filter-item]") ?? [],
    );
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const target = focusOnOpen.current;
    focusOnOpen.current = null;
    if (target) {
      const list = items();
      (target === "last" ? list[list.length - 1] : list[0])?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function openWith(focus: "first" | "last") {
    focusOnOpen.current = focus;
    setOpen(true);
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (
      event.key === "ArrowDown" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (open) {
        items()[0]?.focus();
      } else {
        openWith("first");
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      openWith("last");
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        list[(index + 1) % list.length]?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        list[(index - 1 + list.length) % list.length]?.focus();
        break;
      case "Home":
        event.preventDefault();
        list[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        list[list.length - 1]?.focus();
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        setOpen(false);
        return;
      default:
        return;
    }
    // Keep the roster's row-navigation keys (window listener) out of the menu.
    event.stopPropagation();
  }

  return (
    <div className="filter-dropdown" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={
          selected.length > 0
            ? "filter-dropdown-trigger has-selection"
            : "filter-dropdown-trigger"
        }
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={fullSelection}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="filter-dropdown-text">{summary}</span>
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className="filter-dropdown-menu"
          onKeyDown={onMenuKeyDown}
        >
          {options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemcheckbox"
                aria-checked={checked}
                className="filter-dropdown-option"
                data-filter-item
                tabIndex={-1}
                onClick={() => onToggle(option.value)}
              >
                <span className="filter-dropdown-check" aria-hidden="true">
                  {checked ? <Check size={14} strokeWidth={2} /> : null}
                </span>
                <span className="filter-dropdown-option-label">
                  {option.label}
                </span>
                {typeof option.count === "number" ? (
                  <>
                    {" "}
                    <span className="filter-dropdown-count">{option.count}</span>
                  </>
                ) : null}
              </button>
            );
          })}
          {options.length === 0 ? (
            <p className="filter-dropdown-empty">No options</p>
          ) : null}
          {selected.length > 0 ? (
            <button
              type="button"
              role="menuitem"
              className="filter-dropdown-clear"
              data-filter-item
              tabIndex={-1}
              onClick={() => {
                onClear();
                close(true);
              }}
            >
              Clear {label.toLowerCase()}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
