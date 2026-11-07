import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

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

/** Matches `.overflow-menu-list` `top: calc(100% + 4px)`. */
export const OVERFLOW_MENU_GAP_PX = 4;

/** Inset kept when the menu is flipped or clamped into the viewport. */
export const OVERFLOW_MENU_VIEWPORT_MARGIN_PX = 8;

type Box = { left: number; top: number; right: number; bottom: number };

export type OverflowMenuPlacement = {
  /** Viewport x of the menu's left edge. */
  left: number;
  /** Viewport y of the menu's top edge. */
  top: number;
  flippedX: boolean;
  flippedY: boolean;
};

function axisOverflow(
  start: number,
  size: number,
  viewportSize: number,
  margin: number,
): number {
  const min = margin;
  const max = viewportSize - margin;
  return Math.max(0, min - start) + Math.max(0, start + size - max);
}

function clampStart(
  start: number,
  size: number,
  viewportSize: number,
  margin: number,
): number {
  const min = margin;
  const max = viewportSize - margin - size;
  if (max < min) return min;
  return Math.min(Math.max(start, min), max);
}

/**
 * Place the menu in viewport coordinates. Prefer the CSS default (right edge
 * aligned to the trigger, opening below). Flip to the other side when that
 * overflows less, then clamp so a menu that fits stays fully on screen.
 */
export function placeOverflowMenu(input: {
  trigger: Box;
  menu: { width: number; height: number };
  viewport: { width: number; height: number };
  margin?: number;
  gap?: number;
}): OverflowMenuPlacement {
  const margin = input.margin ?? OVERFLOW_MENU_VIEWPORT_MARGIN_PX;
  const gap = input.gap ?? OVERFLOW_MENU_GAP_PX;
  const { trigger, menu, viewport } = input;

  const alignEnd = trigger.right - menu.width;
  const alignStart = trigger.left;
  const flippedX =
    axisOverflow(alignStart, menu.width, viewport.width, margin) <
    axisOverflow(alignEnd, menu.width, viewport.width, margin);
  const left = clampStart(
    flippedX ? alignStart : alignEnd,
    menu.width,
    viewport.width,
    margin,
  );

  const below = trigger.bottom + gap;
  const above = trigger.top - gap - menu.height;
  const flippedY =
    axisOverflow(above, menu.height, viewport.height, margin) <
    axisOverflow(below, menu.height, viewport.height, margin);
  const top = clampStart(
    flippedY ? above : below,
    menu.height,
    viewport.height,
    margin,
  );

  return { left, top, flippedX, flippedY };
}

type MenuStyle = { left: number; top: number; maxWidth: number };

function menuButtons(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
  );
}

/** Web ⋯ overflow menu for secondary actions (P4 / foundations). */
export function OverflowMenu({
  items,
  label = "More actions",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<MenuStyle | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  function closeAndFocusTrigger() {
    triggerRef.current?.focus({ preventScroll: true });
    setOpen(false);
  }

  function activate(item: OverflowMenuItem) {
    if (item.disabled) return;
    closeAndFocusTrigger();
    item.onSelect();
  }

  useLayoutEffect(() => {
    if (!open) return;
    const first = rootRef.current?.querySelector<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)',
    );
    (first ?? triggerRef.current)?.focus({ preventScroll: true });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }
    const root = rootRef.current;
    const menu = menuRef.current;
    if (!root || !menu) return;

    function update() {
      const currentRoot = rootRef.current;
      const currentMenu = menuRef.current;
      if (!currentRoot || !currentMenu) return;
      const rootRect = currentRoot.getBoundingClientRect();
      const menuRect = currentMenu.getBoundingClientRect();
      if (menuRect.width <= 0 || menuRect.height <= 0) return;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const placed = placeOverflowMenu({
        trigger: rootRect,
        menu: { width: menuRect.width, height: menuRect.height },
        viewport,
      });
      const maxWidth = Math.max(
        0,
        viewport.width - OVERFLOW_MENU_VIEWPORT_MARGIN_PX * 2,
      );
      const next = {
        left: placed.left - rootRect.left,
        top: placed.top - rootRect.top,
        maxWidth,
      };
      setMenuStyle((prev) =>
        prev &&
        prev.left === next.left &&
        prev.top === next.top &&
        prev.maxWidth === next.maxWidth
          ? prev
          : next,
      );
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, items]);

  useEffect(() => {
    if (!open) return;
    function onDoc(ev: MouseEvent) {
      if (!rootRef.current?.contains(ev.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        // Keep parent drawers open when closing this menu.
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        closeAndFocusTrigger();
        return;
      }
      const root = rootRef.current;
      if (!root) return;
      const target = ev.target;
      if (!(target instanceof Node) || !root.contains(target)) return;
      const buttons = menuButtons(root);
      if (buttons.length === 0) return;
      const current = buttons.findIndex((button) => button === document.activeElement);
      const focusAt = (index: number) => {
        buttons[(index + buttons.length) % buttons.length]?.focus({
          preventScroll: true,
        });
      };
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        ev.stopPropagation();
        focusAt(current < 0 ? 0 : current + 1);
        return;
      }
      if (ev.key === "ArrowUp") {
        ev.preventDefault();
        ev.stopPropagation();
        focusAt(current < 0 ? buttons.length - 1 : current - 1);
        return;
      }
      if (ev.key === "Home") {
        ev.preventDefault();
        ev.stopPropagation();
        buttons[0]?.focus({ preventScroll: true });
        return;
      }
      if (ev.key === "End") {
        ev.preventDefault();
        ev.stopPropagation();
        buttons[buttons.length - 1]?.focus({ preventScroll: true });
        return;
      }
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        ev.stopPropagation();
        const index = current < 0 ? 0 : current;
        const id = buttons[index]?.dataset.menuItemId;
        const item = items.find((entry) => entry.id === id);
        if (item) activate(item);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, items]);

  const listStyle: CSSProperties | undefined = menuStyle
    ? {
        left: menuStyle.left,
        top: menuStyle.top,
        right: "auto",
        maxWidth: menuStyle.maxWidth,
      }
    : undefined;

  return (
    <div className={`overflow-menu ${className}`.trim()} ref={rootRef}>
      <button
        ref={triggerRef}
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
        <ul
          ref={menuRef}
          id={menuId}
          role="menu"
          className="overflow-menu-list"
          style={listStyle}
        >
          {items.map((item) => (
            <li key={item.id} role="none">
              <button
                type="button"
                role="menuitem"
                data-menu-item-id={item.id}
                className={
                  item.destructive
                    ? "overflow-menu-item overflow-menu-item-destructive"
                    : "overflow-menu-item"
                }
                disabled={item.disabled}
                onClick={() => activate(item)}
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
