import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { Text } from "react-native";
import { act, fireEvent, render, screen } from "../test/render";
import { CardRow, ListScreen, PagedListFooter, type ListScreenHandle } from "./ListScreen";

const DATA = Array.from({ length: 40 }, (_, i) => ({ id: `row-${i}`, name: `Row ${i}` }));

/**
 * The harness has no layout engine: give the scroll container the size a phone
 * would, then scroll it near its end, as a finger does.
 */
function scrollNearEnd(container: HTMLElement) {
  Object.defineProperty(container, "scrollHeight", { configurable: true, value: 4000 });
  Object.defineProperty(container, "clientHeight", { configurable: true, value: 800 });
  Object.defineProperty(container, "offsetHeight", { configurable: true, value: 800 });
  Object.defineProperty(container, "offsetWidth", { configurable: true, value: 393 });
  Object.defineProperty(container, "scrollWidth", { configurable: true, value: 393 });
  Object.defineProperty(container, "scrollTop", { configurable: true, value: 2900 });
  fireEvent.scroll(container);
}

function scroller(): HTMLElement {
  const main = screen.getByRole("main");
  const el = main.querySelector<HTMLElement>("[data-testid], div");
  return (
    Array.from(main.querySelectorAll<HTMLElement>("div")).find(
      (node) => getComputedStyle(node).overflowY === "auto" || getComputedStyle(node).overflowY === "scroll",
    ) ?? el!
  );
}

describe("ListScreen", () => {
  it("renders the header above the rows and the footer slot", () => {
    render(
      <ListScreen
        title="Things"
        data={DATA.slice(0, 3)}
        keyExtractor={(row) => row.id}
        header={<Text>Header block</Text>}
        footer={<Text>Toast slot</Text>}
        footerVariant="toast"
        renderItem={({ item, index }) => (
          <CardRow first={index === 0} last={index === 2}>
            <Text>{item.name}</Text>
          </CardRow>
        )}
      />,
    );
    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByText("Header block")).toBeTruthy();
    expect(screen.getByText("Row 0")).toBeTruthy();
    expect(screen.getByText("Row 2")).toBeTruthy();
    expect(screen.getByText("Toast slot")).toBeTruthy();
  });

  it("renders sections with their headers", () => {
    render(
      <ListScreen<{ id: string; name: string }, { day: string }>
        title="Days"
        sections={[
          { day: "Today", data: DATA.slice(0, 2) },
          { day: "Yesterday", data: DATA.slice(2, 3) },
        ]}
        keyExtractor={(row) => row.id}
        renderSectionHeader={({ section }) => <Text>{section.day}</Text>}
        renderItem={({ item }) => <Text>{item.name}</Text>}
      />,
    );
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("Yesterday")).toBeTruthy();
    expect(screen.getByText("Row 2")).toBeTruthy();
  });

  it("asks for more once the list is scrolled near its end", () => {
    const onEndReached = vi.fn();
    render(
      <ListScreen
        title="Things"
        data={DATA}
        initialNumToRender={DATA.length}
        keyExtractor={(row) => row.id}
        onEndReached={onEndReached}
        renderItem={({ item }) => <Text>{item.name}</Text>}
      />,
    );
    expect(onEndReached).not.toHaveBeenCalled();
    act(() => scrollNearEnd(scroller()));
    expect(onEndReached).toHaveBeenCalled();
  });

  it("exposes scrollToOffset and scrollToLocation on its ref", () => {
    const ref = createRef<ListScreenHandle>();
    render(
      <ListScreen
        ref={ref}
        title="Things"
        data={DATA.slice(0, 3)}
        keyExtractor={(row) => row.id}
        renderItem={({ item }) => <Text>{item.name}</Text>}
      />,
    );
    expect(typeof ref.current?.scrollToOffset).toBe("function");
    expect(typeof ref.current?.scrollToLocation).toBe("function");
    expect(() => ref.current?.scrollToOffset({ offset: 0, animated: false })).not.toThrow();
  });
});

describe("PagedListFooter", () => {
  it("shows a quiet loading row while a page loads", () => {
    render(<PagedListFooter loadingMore failure={null} onRetry={vi.fn()} />);
    expect(screen.getByTestId("paged-footer-loading")).toBeTruthy();
    expect(screen.getByText("Loading more…")).toBeTruthy();
  });

  it("offers an inline retry when the page failed", () => {
    const onRetry = vi.fn();
    render(<PagedListFooter loadingMore={false} failure="failed" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Couldn't load more. Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("says offline in neutral words, with no failure copy", () => {
    render(<PagedListFooter loadingMore={false} failure="offline" onRetry={vi.fn()} />);
    expect(screen.getByText("You're offline. Showing what's loaded.")).toBeTruthy();
    expect(screen.queryByText(/Couldn't load more/)).toBeNull();
  });

  it("renders nothing at the end of the list", () => {
    const { container } = render(
      <PagedListFooter loadingMore={false} failure={null} onRetry={vi.fn()} />,
    );
    expect(container.textContent).toBe("");
  });
});
