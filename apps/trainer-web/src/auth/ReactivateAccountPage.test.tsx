/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accountReactivationCopy,
  formatPurgeDate,
} from "@fitbud/core";
import { ReactivateAccountPage } from "./ReactivateAccountPage";
import { archivedPurgeAfter } from "./archivedAccount";
import { ApiClientError } from "@fitbud/api-client";

const PURGE_AFTER = "2027-05-03T04:12:09.000Z";
const ZONE = "Asia/Kolkata";
const PURGE_LABEL = formatPurgeDate(PURGE_AFTER, ZONE);

afterEach(() => {
  cleanup();
});

describe("archivedPurgeAfter", () => {
  it("reads purgeAfter from 403 ACCOUNT_ARCHIVED details", () => {
    const err = new ApiClientError({
      code: "ACCOUNT_ARCHIVED",
      message: "This account is deleted. Sign in again and bring it back to continue.",
      requestId: "r",
      status: 403,
      details: { accountState: "archived", purgeAfter: PURGE_AFTER },
    });
    expect(archivedPurgeAfter(err)).toBe(PURGE_AFTER);
  });

  it("returns null for other errors", () => {
    expect(
      archivedPurgeAfter(
        new ApiClientError({
          code: "FORBIDDEN",
          message: "Forbidden.",
          requestId: "r",
          status: 403,
        }),
      ),
    ).toBeNull();
  });
});

describe("ReactivateAccountPage (Z12-30)", () => {
  it("shows D-W12-6 trainer copy with the purge date, never ISO", () => {
    render(
      <ReactivateAccountPage
        purgeAfter={PURGE_AFTER}
        busy={false}
        error={null}
        onReactivate={() => undefined}
        onSignOut={() => undefined}
        timeZone={ZONE}
        signedInAs="rahul.coach@demo.fitbud.test"
      />,
    );
    expect(screen.getByTestId("reactivate-account")).toBeTruthy();
    expect(screen.getByRole("heading", { name: accountReactivationCopy.title })).toBeTruthy();
    expect(
      screen.getByText(accountReactivationCopy.body(PURGE_LABEL)),
    ).toBeTruthy();
    expect(screen.getByText(accountReactivationCopy.trainerNote)).toBeTruthy();
    expect(screen.getByText(accountReactivationCopy.signOutNote)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/2027-05-03/);
    expect(screen.getByText(/Signed in as rahul\.coach@demo\.fitbud\.test/)).toBeTruthy();
  });

  it("wires Reactivate and Sign out", () => {
    const onReactivate = vi.fn();
    const onSignOut = vi.fn();
    render(
      <ReactivateAccountPage
        purgeAfter={PURGE_AFTER}
        busy={false}
        error={null}
        onReactivate={onReactivate}
        onSignOut={onSignOut}
        timeZone={ZONE}
      />,
    );
    fireEvent.click(screen.getByTestId("reactivate-account-confirm"));
    fireEvent.click(screen.getByTestId("reactivate-account-sign-out"));
    expect(onReactivate).toHaveBeenCalledTimes(1);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("disables actions while busy and shows an error", () => {
    render(
      <ReactivateAccountPage
        purgeAfter={PURGE_AFTER}
        busy
        error="Something went wrong. Try again."
        onReactivate={() => undefined}
        onSignOut={() => undefined}
        timeZone={ZONE}
      />,
    );
    expect(
      (screen.getByTestId("reactivate-account-confirm") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("reactivate-account-sign-out") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe(
      "Something went wrong. Try again.",
    );
  });
});
