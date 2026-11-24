/**
 * Z14-3: a kept tab refreshes when it becomes active again only if its data is
 * older than 30 s (or the shell forces it after a detail screen closed).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { act, render } from "../test/render";
import { TRAINER_STALE_MS } from "./cache";
import { useRefreshWhenActive } from "./keptTab";

function Probe(p: { active: boolean; reload: () => void; loadedAt: number; force?: number }) {
  const lastLoadedAt = useRef(p.loadedAt);
  useRefreshWhenActive(p.active, lastLoadedAt, p.reload, p.force);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-10T04:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useRefreshWhenActive", () => {
  it("does not reload on a quick switch back, and reloads after 30 s", () => {
    const reload = vi.fn();
    const loadedAt = Date.now();
    const view = render(<Probe active reload={reload} loadedAt={loadedAt} />);
    expect(reload).not.toHaveBeenCalled();

    view.rerender(<Probe active={false} reload={reload} loadedAt={loadedAt} />);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    view.rerender(<Probe active reload={reload} loadedAt={loadedAt} />);
    expect(reload).not.toHaveBeenCalled();

    view.rerender(<Probe active={false} reload={reload} loadedAt={loadedAt} />);
    act(() => {
      vi.advanceTimersByTime(TRAINER_STALE_MS + 1_000);
    });
    view.rerender(<Probe active reload={reload} loadedAt={loadedAt} />);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("a forced return reloads whatever the age, once", () => {
    const reload = vi.fn();
    const loadedAt = Date.now();
    const view = render(<Probe active reload={reload} loadedAt={loadedAt} force={0} />);
    view.rerender(<Probe active={false} reload={reload} loadedAt={loadedAt} force={0} />);
    view.rerender(<Probe active reload={reload} loadedAt={loadedAt} force={1} />);
    expect(reload).toHaveBeenCalledTimes(1);

    view.rerender(<Probe active={false} reload={reload} loadedAt={loadedAt} force={1} />);
    view.rerender(<Probe active reload={reload} loadedAt={loadedAt} force={1} />);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
