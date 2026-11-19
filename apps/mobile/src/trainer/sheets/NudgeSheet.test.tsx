import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import { fireEvent, render, screen, waitFor } from "../../test/render";
import { NudgeSheet, type NudgeApi } from "./NudgeSheet";
import type { NudgeTarget } from "./nudgeContent";

const REL = "11111111-1111-4111-8111-111111111111";
const target: NudgeTarget = {
  relationshipId: REL,
  activityType: "workout",
  activityId: "22222222-2222-4222-8222-222222222222",
  kindLabel: "Missed workouts",
  sourceName: "Lower body A",
  dayLabel: "Tue",
};

function makeApi(over: Partial<NudgeApi> = {}): NudgeApi {
  return {
    getResponsiveness: vi.fn(async () => ({
      label: "responds" as const,
      counts: { sent: 0, opened: 0, loggedAfter: 0, loggedBefore: 0 },
      pushEnabled: true,
    })),
    nudgeActivity: vi.fn(async () => ({
      notification: {} as never,
      deduped: false,
      delivery: "push" as const,
      inboxReason: null,
    })),
    ...over,
  };
}

function renderSheet(api: NudgeApi, onSent = vi.fn()) {
  render(
    <NudgeSheet
      visible
      target={target}
      traineeDisplayName="Rohan Mehta"
      clientTimeZone="Asia/Kolkata"
      trainerDisplayName="Rahul Sharma"
      api={api}
      onDismiss={() => {}}
      onSent={onSent}
    />,
  );
  return onSent;
}

describe("NudgeSheet", () => {
  it("shows the fixed title and the Gentle body, and never mentions WhatsApp", () => {
    renderSheet(makeApi());
    expect(screen.getByText("Nudge Rohan")).toBeTruthy();
    expect(screen.getByText("Rahul nudged you")).toBeTruthy();
    expect(
      screen.getByText("Lower body A is waiting. Can you fit it in soon?"),
    ).toBeTruthy();
    expect(screen.queryByText(/whatsapp/i)).toBeNull();
  });

  it("a chip replaces the body", () => {
    renderSheet(makeApi());
    fireEvent.click(screen.getByText("Reschedule"));
    expect(
      screen.getByText(
        "Want to move Lower body A to another day? Tell me what works.",
      ),
    ).toBeTruthy();
  });

  it("Send posts the body to the nudge endpoint and reports the toast", async () => {
    const api = makeApi();
    const onSent = renderSheet(api);
    fireEvent.click(screen.getByText("Send nudge"));
    await waitFor(() => expect(onSent).toHaveBeenCalledWith("Nudge sent to Rohan"));
    expect(api.nudgeActivity).toHaveBeenCalledWith(REL, {
      activityType: "workout",
      activityId: target.activityId,
      body: "Lower body A is waiting. Can you fit it in soon?",
    });
  });

  it("push off from the client's preference shows the TM-04o line and still sends", async () => {
    const api = makeApi({
      getResponsiveness: vi.fn(async () => ({
        label: "responds" as const,
        counts: { sent: 0, opened: 0, loggedAfter: 0, loggedBefore: 0 },
        pushEnabled: false,
      })),
      nudgeActivity: vi.fn(async () => ({
        notification: {} as never,
        deduped: false,
        delivery: "inbox" as const,
        inboxReason: "push_off" as const,
      })),
    });
    const onSent = renderSheet(api);
    await screen.findByText(/has turned off FitBud notifications/);
    fireEvent.click(screen.getByText("Send nudge"));
    await waitFor(() =>
      expect(onSent).toHaveBeenCalledWith("Nudge sent to Rohan's inbox. Push is off"),
    );
  });

  it("the daily cap (429 NUDGE_LIMIT) shows the TM-04n line and disables Send", async () => {
    const api = makeApi({
      nudgeActivity: vi.fn(async () => {
        throw new ApiClientError({
          status: 429,
          code: "NUDGE_LIMIT",
          message: "You can nudge this client again tomorrow.",
          requestId: "req-1",
        });
      }),
    });
    const onSent = renderSheet(api);
    fireEvent.click(screen.getByText("Send nudge"));
    await screen.findByText("You can nudge Rohan again tomorrow.");
    expect(onSent).not.toHaveBeenCalled();
    const send = screen.getByTestId("nudge-send") as HTMLButtonElement;
    expect(send.getAttribute("aria-disabled") === "true" || send.disabled).toBe(true);
  });

  it("a deduped nudge shows the stored body in the preview (TM-04n)", async () => {
    const api = makeApi({
      nudgeActivity: vi.fn(async () => ({
        notification: { body: "Earlier today: please log Dinner." } as never,
        deduped: true,
        nudgedAt: "2026-11-17T06:00:00.000Z",
        delivery: "push" as const,
        inboxReason: null,
      })),
    });
    renderSheet(api);
    fireEvent.click(screen.getByText("Send nudge"));
    await screen.findByText("Earlier today: please log Dinner.");
    expect(
      screen.queryByText("Lower body A is waiting. Can you fit it in soon?"),
    ).toBeNull();
  });

  it("a link in the body blocks Send before any request", () => {
    const api = makeApi();
    renderSheet(api);
    fireEvent.click(screen.getByTestId("nudge-preview"));
    fireEvent.change(screen.getByTestId("nudge-body-input"), {
      target: { value: "Book at wa.me/9199" },
    });
    expect(screen.getByText("Nudges can't include links.")).toBeTruthy();
    fireEvent.click(screen.getByText("Send nudge"));
    expect(api.nudgeActivity).not.toHaveBeenCalled();
  });

  it("with several open items it asks which first (TM-03j), in the same sheet, then composes", () => {
    const meal: NudgeTarget = {
      ...target,
      activityType: "meal",
      activityId: "33333333-3333-4333-8333-333333333333",
      kindLabel: "Dinner not logged",
      sourceName: "Dinner",
      dayLabel: "Fri",
    };
    render(
      <NudgeSheet
        visible
        target={null}
        pickItems={[
          { id: "a", title: "Missed workout", detail: "Tue 17 Nov · critical", target },
          { id: "b", title: "Overdue meal", detail: "Fri 13 Nov", target: meal },
        ]}
        traineeDisplayName="Rohan Mehta"
        clientTimeZone="Asia/Kolkata"
        trainerDisplayName="Rahul Sharma"
        api={makeApi()}
        onDismiss={() => {}}
        onSent={() => {}}
      />,
    );
    expect(screen.getByText("Nudge Rohan about…")).toBeTruthy();
    fireEvent.click(screen.getByTestId("nudge-pick-b"));
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Nudge Rohan")).toBeTruthy();
    expect(
      screen.getByText("Dinner wasn't logged on Fri. Can you add it, even roughly?"),
    ).toBeTruthy();
  });
});
