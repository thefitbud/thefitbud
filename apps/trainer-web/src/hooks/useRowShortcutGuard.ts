import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

/** Single-key shortcuts are ignored for this long after a drawer closes. */
export const SHORTCUT_QUIET_MS = 1000;
/** A focus event this soon after a Tab keydown counts as Tab navigation. */
const TAB_FOCUS_WINDOW_MS = 250;

/** True for inputs, textareas, selects and contenteditable regions. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") {
    return false;
  }
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  return (
    el.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"]',
    ) !== null
  );
}

/**
 * HM4: guard for the Home "Needs attention" single-key shortcuts (a / n / o).
 *
 * The shortcuts are only honoured once the trainer has deliberately reached
 * the grid: by Tab / Shift+Tab, by pointer, or by arrow / Home / End keys.
 * Focus that code puts back on a row (after a drawer closes) does not arm
 * them, and every drawer close also opens a short quiet window. Modifier
 * keys, IME composition, auto-repeat and editable targets never trigger them.
 */
export function useRowShortcutGuard() {
  const armedRef = useRef(false);
  const suppressFocusArmRef = useRef(false);
  const quietUntilRef = useRef(0);
  const lastTabAtRef = useRef(-Infinity);

  useEffect(() => {
    function onKeyDownCapture(ev: KeyboardEvent) {
      if (ev.key === "Tab") lastTabAtRef.current = Date.now();
    }
    document.addEventListener("keydown", onKeyDownCapture, true);
    return () =>
      document.removeEventListener("keydown", onKeyDownCapture, true);
  }, []);

  /** Grid onFocus: arm only when focus arrived through Tab navigation. */
  const onGridFocus = useCallback(() => {
    if (suppressFocusArmRef.current) return;
    if (Date.now() - lastTabAtRef.current <= TAB_FOCUS_WINDOW_MS) {
      armedRef.current = true;
    }
  }, []);

  /** Grid onPointerDown: a click or tap on a row is deliberate. */
  const onGridPointerDown = useCallback(() => {
    armedRef.current = true;
  }, []);

  /** Arrow / Home / End navigation inside the grid is deliberate. */
  const armFromKeyboard = useCallback(() => {
    armedRef.current = true;
  }, []);

  /** Call from every drawer close path. Disarms and starts the quiet window. */
  const noteDrawerClosed = useCallback(() => {
    armedRef.current = false;
    quietUntilRef.current = Date.now() + SHORTCUT_QUIET_MS;
  }, []);

  /** Focus an element from code without arming the shortcuts. */
  const focusWithoutArming = useCallback(
    (el: HTMLElement | null | undefined) => {
      if (!el) return;
      suppressFocusArmRef.current = true;
      try {
        el.focus();
      } finally {
        suppressFocusArmRef.current = false;
      }
    },
    [],
  );

  /** Whether a single-key row shortcut (a / n / o) may act on this event. */
  const allowRowShortcut = useCallback(
    (ev: ReactKeyboardEvent<HTMLElement>): boolean => {
      if (ev.repeat) return false;
      if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return false;
      // keyCode 229: Safari / WebKit IME keydowns can report isComposing false.
      if (
        ev.nativeEvent.isComposing ||
        ev.nativeEvent.keyCode === 229 ||
        ev.key === "Process"
      ) {
        return false;
      }
      if (isEditableTarget(ev.target)) return false;
      if (Date.now() < quietUntilRef.current) return false;
      return armedRef.current;
    },
    [],
  );

  return {
    onGridFocus,
    onGridPointerDown,
    armFromKeyboard,
    noteDrawerClosed,
    focusWithoutArming,
    allowRowShortcut,
  };
}
