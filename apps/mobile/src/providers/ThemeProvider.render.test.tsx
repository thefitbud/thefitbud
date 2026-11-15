/**
 * Z12-36: the system scheme is tracked live (`Appearance`, no in-app switch,
 * D-W12-12), and dark is opt-in per screen until each screen is migrated
 * (orchestrator, PR #440 review): `<Screen v3>` or `<ThemeScope scheme="system">`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Appearance } from "react-native";
import { themes } from "@fitbud/ui-mobile";
import { act, render, screen } from "../test/render";
import { Screen } from "../components/Screen";
import { Text } from "../components/Text";
import {
  ThemeProvider,
  ThemeScope,
  useBarScheme,
  useSystemColorScheme,
  useTheme,
} from "./ThemeProvider";

type Listener = (prefs: { colorScheme: "light" | "dark" | null }) => void;

/** Drive Appearance like the OS does: a current value plus change events. */
function fakeAppearance(initial: "light" | "dark" | null) {
  let current = initial;
  const listeners = new Set<Listener>();
  vi.spyOn(Appearance, "getColorScheme").mockImplementation(() => current);
  vi.spyOn(Appearance, "addChangeListener").mockImplementation((listener) => {
    listeners.add(listener as Listener);
    return {
      remove: () => listeners.delete(listener as Listener),
    } as ReturnType<typeof Appearance.addChangeListener>;
  });
  return {
    flip(next: "light" | "dark" | null) {
      current = next;
      for (const listener of listeners) listener({ colorScheme: next });
    },
    listenerCount: () => listeners.size,
  };
}

function Probe({ id = "" }: { id?: string }) {
  const theme = useTheme();
  const system = useSystemColorScheme();
  return (
    <>
      <Text testID={`scheme${id}`}>{theme.scheme}</Text>
      <Text testID={`system${id}`}>{system}</Text>
      <Text testID={`bg${id}`}>{theme.colors.bg}</Text>
    </>
  );
}

function BarProbe() {
  return <Text testID="bar">{useBarScheme()}</Text>;
}

const text = (id: string) => screen.getByTestId(id).textContent;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ThemeProvider and ThemeScope", () => {
  it("under system dark, an un-opted subtree renders light tokens", () => {
    fakeAppearance("dark");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(text("system")).toBe("dark");
    expect(text("scheme")).toBe("light");
    expect(text("bg")).toBe(themes.light.colors.bg);
  });

  it("under system dark, an opted-in subtree renders dark tokens", () => {
    fakeAppearance("dark");
    render(
      <ThemeProvider>
        <Probe id="-plain" />
        <ThemeScope scheme="system">
          <Probe id="-opted" />
        </ThemeScope>
      </ThemeProvider>,
    );
    expect(text("scheme-plain")).toBe("light");
    expect(text("scheme-opted")).toBe("dark");
    expect(text("bg-opted")).toBe("#0F0F13");
  });

  it("an opted-in subtree switches live when the system flips, both ways", () => {
    const os = fakeAppearance("light");
    render(
      <ThemeProvider>
        <ThemeScope scheme="system">
          <Probe />
        </ThemeScope>
      </ThemeProvider>,
    );
    expect(text("scheme")).toBe("light");
    act(() => os.flip("dark"));
    expect(text("scheme")).toBe("dark");
    expect(text("bg")).toBe("#0F0F13");
    act(() => os.flip("light"));
    expect(text("scheme")).toBe("light");
    expect(text("bg")).toBe("#F4F5F8");
  });

  it("treats an unknown system scheme (null) as light", () => {
    const os = fakeAppearance("dark");
    render(
      <ThemeProvider>
        <ThemeScope scheme="system">
          <Probe />
        </ThemeScope>
      </ThemeProvider>,
    );
    act(() => os.flip(null));
    expect(text("scheme")).toBe("light");
  });

  it("stops listening to Appearance when unmounted", () => {
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

  it("a forced scope ignores the system (dev gallery and tests only)", () => {
    const os = fakeAppearance("light");
    render(
      <ThemeProvider>
        <ThemeScope scheme="dark">
          <Probe />
        </ThemeScope>
      </ThemeProvider>,
    );
    expect(text("scheme")).toBe("dark");
    act(() => os.flip("dark"));
    act(() => os.flip("light"));
    expect(text("scheme")).toBe("dark");
    expect(text("system")).toBe("light");
  });

  it("is light outside a provider, so components render deterministically on their own", () => {
    fakeAppearance("dark");
    render(<Probe />);
    expect(text("scheme")).toBe("light");
  });

  it("the status bar follows the opted-in screen, and light once it is gone", () => {
    const os = fakeAppearance("dark");
    const view = render(
      <ThemeProvider>
        <BarProbe />
        <ThemeScope scheme="system">
          <Probe />
        </ThemeScope>
      </ThemeProvider>,
    );
    expect(text("bar")).toBe("dark");
    act(() => os.flip("light"));
    expect(text("bar")).toBe("light");
    act(() => os.flip("dark"));
    view.rerender(
      <ThemeProvider>
        <BarProbe />
      </ThemeProvider>,
    );
    expect(text("bar")).toBe("light");
  });
});

describe("Screen opt-in", () => {
  const colourOf = (label: string) =>
    window.getComputedStyle(screen.getByText(label)).getPropertyValue("color");
  const canon = (hex: string) => {
    const n = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16);
    return `rgba(${n(1)}, ${n(3)}, ${n(5)}, 1.00)`;
  };

  it("under system dark, an un-opted Screen renders light tokens", () => {
    fakeAppearance("dark");
    render(
      <ThemeProvider>
        <Screen title="Unmigrated screen">
          <Text>Body</Text>
        </Screen>
      </ThemeProvider>,
    );
    expect(colourOf("Unmigrated screen")).toBe(canon(themes.light.colors.ink));
    expect(colourOf("Body")).toBe(canon(themes.light.colors.ink));
  });

  it("under system dark, <Screen v3> renders dark tokens", () => {
    fakeAppearance("dark");
    render(
      <ThemeProvider>
        <Screen v3 title="Migrated screen">
          <Text>Body</Text>
        </Screen>
      </ThemeProvider>,
    );
    expect(colourOf("Migrated screen")).toBe(canon(themes.dark.colors.ink));
    expect(colourOf("Body")).toBe(canon(themes.dark.colors.ink));
  });
});
