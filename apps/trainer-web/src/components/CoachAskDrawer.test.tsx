/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, afterEach } from "vitest";
import { useEffect, useRef } from "react";
import { act, render, cleanup } from "@testing-library/react";

/**
 * Test that focus initialization happens only once on mount, not on
 * every onClose change. This was causing focus theft when the parent
 * re-rendered with a new onClose callback every ~4s during polling.
 */
describe("Drawer focus behavior pattern", () => {
  afterEach(() => {
    cleanup();
  });

  it("focus effect with empty deps does not re-run on prop changes", async () => {
    const focusCalls: number[] = [];
    
    function TestDrawer({ onClose }: { onClose: () => void }) {
      const closeRef = useRef<HTMLButtonElement>(null);
      
      // This is the pattern we're using in the fix
      useEffect(() => {
        closeRef.current?.focus();
        focusCalls.push(Date.now());
      }, []); // Empty deps = runs only on mount
      
      // Separate effect for keyboard handler that depends on onClose
      useEffect(() => {
        function onKey(ev: KeyboardEvent) {
          if (ev.key === "Escape") {
            onClose();
          }
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, [onClose]);
      
      return (
        <div>
          <button ref={closeRef} data-testid="close">X</button>
          <textarea data-testid="note" />
        </div>
      );
    }

    const { getByTestId, rerender } = render(
      <TestDrawer onClose={() => console.log("close 1")} />
    );
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    
    expect(focusCalls.length).toBe(1);
    
    // Focus the textarea
    const textarea = getByTestId("note");
    act(() => {
      textarea.focus();
    });
    
    expect(document.activeElement).toBe(textarea);
    
    // Re-render with new onClose (simulating parent re-render)
    rerender(<TestDrawer onClose={() => console.log("close 2")} />);
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    
    // Focus should still be on textarea
    expect(document.activeElement).toBe(textarea);
    // Focus effect should not have run again
    expect(focusCalls.length).toBe(1);
  });
  
  it("focus effect WITH onClose dep would re-run (anti-pattern)", async () => {
    const focusCalls: number[] = [];
    
    function BadDrawer({ onClose }: { onClose: () => void }) {
      const closeRef = useRef<HTMLButtonElement>(null);
      
      // This is the OLD buggy pattern that causes focus theft
      useEffect(() => {
        closeRef.current?.focus();
        focusCalls.push(Date.now());
        
        function onKey(ev: KeyboardEvent) {
          if (ev.key === "Escape") {
            onClose();
          }
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, [onClose]); // onClose dependency causes re-run
      
      return (
        <div>
          <button ref={closeRef} data-testid="bad-close">X</button>
          <textarea data-testid="bad-note" />
        </div>
      );
    }

    const { getByTestId, rerender } = render(
      <BadDrawer onClose={() => console.log("close 1")} />
    );
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    
    expect(focusCalls.length).toBe(1);
    
    // Focus the textarea
    const textarea = getByTestId("bad-note");
    act(() => {
      textarea.focus();
    });
    
    expect(document.activeElement).toBe(textarea);
    
    // Re-render with new onClose
    rerender(<BadDrawer onClose={() => console.log("close 2")} />);
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    
    // With the buggy pattern, focus would be stolen back to the close button
    const closeButton = getByTestId("bad-close");
    expect(document.activeElement).toBe(closeButton);
    // And the focus effect ran again
    expect(focusCalls.length).toBe(2);
  });
});
