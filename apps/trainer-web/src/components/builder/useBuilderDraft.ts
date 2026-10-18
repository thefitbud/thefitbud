import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "@fitbud/api-client";
import type { PlanContent } from "@fitbud/contracts";
import { planContentError } from "../plan-composition";

export type SaveState =
  | { kind: "saved"; at: Date | null }
  | { kind: "saving" }
  | { kind: "dirty" }
  | { kind: "invalid"; message: string }
  | { kind: "error"; message: string }
  | { kind: "conflict" };

const UNDO_LIMIT = 20;
const AUTOSAVE_MS = 1200;

export function isConflictError(err: unknown): boolean {
  return (
    err instanceof ApiClientError &&
    (err.status === 409 || err.code === "CONFLICT" || err.code === "STALE_RECORD_VERSION")
  );
}

/**
 * Local draft state with a 20-step undo stack and debounced autosave.
 * `save` must throw on failure; a 409 becomes the "changed in another tab" state.
 */
export function useBuilderDraft({
  initialContent,
  title,
  save,
  enabled,
}: {
  initialContent: PlanContent;
  title: string;
  save: (title: string, content: PlanContent) => Promise<void>;
  enabled: boolean;
}) {
  const [content, setContentState] = useState(initialContent);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "saved", at: null });
  const [undoDepth, setUndoDepth] = useState(0);
  const undoStack = useRef<PlanContent[]>([]);
  const savedJson = useRef(JSON.stringify({ title, content: initialContent }));
  const latest = useRef({ title, content: initialContent });
  const saveRef = useRef(save);
  saveRef.current = save;
  const inFlight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<number | null>(null);
  const conflicted = useRef(false);

  latest.current = { title, content };

  const persist = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) {
      await inFlight.current;
    }
    if (conflicted.current) return false;
    const snapshot = latest.current;
    const json = JSON.stringify(snapshot);
    if (json === savedJson.current) return true;
    const invalid = planContentError(snapshot.content);
    if (invalid) {
      setSaveState({ kind: "invalid", message: invalid });
      return false;
    }
    if (!snapshot.title.trim()) {
      setSaveState({ kind: "invalid", message: "Add a plan title." });
      return false;
    }
    setSaveState({ kind: "saving" });
    const run = (async () => {
      try {
        await saveRef.current(snapshot.title.trim(), snapshot.content);
        savedJson.current = json;
        setSaveState(
          JSON.stringify(latest.current) === json
            ? { kind: "saved", at: new Date() }
            : { kind: "dirty" },
        );
        return true;
      } catch (err) {
        if (isConflictError(err)) {
          conflicted.current = true;
          setSaveState({ kind: "conflict" });
        } else {
          setSaveState({
            kind: "error",
            message: "Couldn't save your latest change.",
          });
        }
        return false;
      }
    })();
    inFlight.current = run;
    const ok = await run;
    inFlight.current = null;
    return ok;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const json = JSON.stringify({ title, content });
    if (json === savedJson.current || conflicted.current) return;
    setSaveState((current) =>
      current.kind === "saving" ? current : { kind: "dirty" },
    );
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void persist();
    }, AUTOSAVE_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [content, title, enabled, persist]);

  const setContent = useCallback(
    (update: (current: PlanContent) => PlanContent) => {
      setContentState((current) => {
        const next = update(current);
        if (next === current) return current;
        undoStack.current = [...undoStack.current.slice(-(UNDO_LIMIT - 1)), current];
        setUndoDepth(undoStack.current.length);
        return next;
      });
    },
    [],
  );

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    setUndoDepth(undoStack.current.length);
    if (previous) setContentState(previous);
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    return persist();
  }, [persist]);

  return { content, setContent, undo, canUndo: undoDepth > 0, saveState, flush };
}
