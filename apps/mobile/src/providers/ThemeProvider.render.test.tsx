/**
 * Z12-36: the theme follows the system (`Appearance`) live, with no in-app
 * switch (D-W12-12).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Appearance } from "react-native";
import { themes } from "@fitbud/ui-mobile";
import { act, render, screen } from "../test/render";
import { Text } from "../components/Text";
import { ThemeProvider, useSystemColorScheme, useTheme } from "./ThemeProvider";

type Listener = (prefs: { colorScheme: "light" | "dark" | null }) => void;

/** Drive Appearance like the OS does: a current value plus change events. */
function fakeAppearance(initial: "light" | "dark" | null) {
  let current = initial;
  const listeners = new Set<Listener>();
  vi.spyOn(Appearance, "getColorScheme").mockImplementation(() => current);
  vi.spyOn(Appearance, "addChangeListener").mockImplementation((listener) => {
    listeners.add(listener as Listener);
    return { remove: () => listeners.delete(listener as Listener) } as ReturnType<
      typeof Appearance.addChangeListener
    >;
  });
  return {
    flip(next: "light" | "dark" | null) {
      current = next;
      for (const listener of listeners) listener({ colorScheme: next });
    },
    listenerCount: () => listeners.size,
  };
}

function Probe() {
  const theme = useTheme();
  const system = useSystemColorScheme();
  return (
    <>
      <Text testID="scheme">{theme.scheme}</Text>
      <Text testID="system">{system}</Text>
      <Text testID="bg">{theme.colors.bg}</Text>
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ThemeProvider", () => {
  it("starts on the system scheme", () => {
    fakeAppearance("dark");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("scheme").textContent).toBe("dark");
    expect(screen.getByTestId("bg").textContent).toBe(themes.dark.colors.bg);
  });

  it("switches live when the system flips, both ways", () => {
    const os = fakeAppearance("light");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("scheme").textContent).toBe("light");

    act(() => os.flip("dark"));
    expect(screen.getByTestId("scheme").textContent).toBe("dark");
    expect(screen.getByTestId("bg").textContent).toBe("#0F0F13");

    act(() => os.flip("light"));
    expect(screen.getByTestId("scheme").textContent).toBe("light");
    expect(screen.getByTestId("bg").textContent).toBe("#F4F5F8");
  });

  it("treats an unknown system scheme (null) as light", () => {
    const os = fakeAppearance("dark");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    act(() => os.flip(null));
    expect(screen.getByTestId("scheme").textContent).toBe("light");
  });

  it("stops listening when unmounted", () => {
    const os = fakeAppearance("light");
    const view = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(os.listenerCount()).toBeGreaterThan(0);
    view.unmount();
    expect(os.listenerCount()).toBe(0);
  });

  it("a preview scheme overrides the system (dev gallery and tests only)", () => {
    const os = fakeAppearance("light");
    render(
      <ThemeProvider scheme="dark">
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("scheme").textContent).toBe("dark");
    act(() => os.flip("light"));
    expect(screen.getByTestId("scheme").textContent).toBe("dark");
    expect(screen.getByTestId("system").textContent).toBe("light");
  });

  it("is light outside a provider, so components render deterministically on their own", () => {
    fakeAppearance("dark");
    render(<Probe />);
    expect(screen.getByTestId("scheme").textContent).toBe("light");
  });
});
