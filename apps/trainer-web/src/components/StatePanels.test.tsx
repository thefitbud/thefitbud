/**
 * @vitest-environment happy-dom
 */
import type { ReactElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  ErrorState,
  ForbiddenState,
  NotFoundState,
  errorKindFromFailure,
} from "./StatePanels";

afterEach(() => {
  cleanup();
});

function wrap(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("errorKindFromFailure", () => {
  it("maps status and network signals", () => {
    expect(errorKindFromFailure({ status: 403 })).toBe("forbidden");
    expect(errorKindFromFailure({ status: 404 })).toBe("notFound");
    expect(errorKindFromFailure({ status: 500 })).toBe("server");
    expect(errorKindFromFailure({ message: "Failed to fetch" })).toBe("network");
  });
});

describe("ErrorState", () => {
  it("renders the centred page-load card with Retry and Email support", () => {
    const onRetry = vi.fn();
    wrap(<ErrorState kind="server" onRetry={onRetry} requestId="req-abc" />);

    const panel = screen.getByTestId("error-state");
    expect(panel.className).toContain("state-card");
    expect(screen.getByRole("heading", { name: /couldn't load this page/i })).toBeTruthy();
    expect(
      screen.getByText(/something went wrong on our side/i),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^retry$/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    const support = screen.getByRole("link", { name: /email support/i });
    expect(support.getAttribute("href")).toMatch(/^mailto:tech@thefitbud\.com/);
    expect(screen.getByText(/request id: req-abc/i)).toBeTruthy();
  });

  it("keeps custom titles for callers that pass one", () => {
    wrap(<ErrorState title="Couldn't load your clients" kind="server" />);
    expect(
      screen.getByRole("heading", { name: /couldn't load your clients/i }),
    ).toBeTruthy();
  });
});

describe("NotFoundState", () => {
  it("shows Go to Clients", () => {
    wrap(<NotFoundState />);
    expect(
      screen.getByRole("heading", { name: /we couldn't find that/i }),
    ).toBeTruthy();
    const link = screen.getByRole("link", { name: /go to clients/i });
    expect(link.getAttribute("href")).toBe("/clients");
  });
});

describe("ForbiddenState", () => {
  it("shows lock card with Go to Clients and Email support", () => {
    wrap(<ForbiddenState />);
    expect(
      screen.getByRole("heading", {
        name: /you don't have access to this client/i,
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(/belongs to another coach/i),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /go to clients/i }).getAttribute("href")).toBe(
      "/clients",
    );
    expect(
      screen.getByRole("link", { name: /email support/i }).getAttribute("href"),
    ).toMatch(/^mailto:/);
  });
});
