import { describe, expect, it } from "vitest";
import { render, screen } from "../../test/render";
import { CoachLogBadge } from "./CoachLogBadge";
import { coachLogLabel } from "./coachLogLabel";

const tz = "Asia/Kolkata";

describe("coachLogLabel", () => {
  it("keeps 'Logged by your coach' after a later coach edit", () => {
    expect(
      coachLogLabel({ loggedByRole: "coach", lastEditedByRole: "coach" }, "2026-11-02T08:00:00Z", tz),
    ).toBe("Logged by your coach");
  });
  it("shows nothing for the trainee's own entry", () => {
    expect(coachLogLabel({ loggedByRole: "trainee", lastEditedByRole: null }, null, tz)).toBeNull();
    expect(coachLogLabel({}, null, tz)).toBeNull();
  });
});

describe("CoachLogBadge", () => {
  it("renders the logged label", () => {
    render(<CoachLogBadge loggedByRole="coach" timeZone={tz} />);
    expect(screen.getByText("Logged by your coach")).toBeTruthy();
  });
  it("renders the edited label with a weekday date", () => {
    render(
      <CoachLogBadge
        loggedByRole="trainee"
        lastEditedByRole="coach"
        editedAt="2026-11-02T08:00:00.000Z"
        timeZone={tz}
      />,
    );
    expect(screen.getByText(/^Edited by your coach · Mon 2 Nov/)).toBeTruthy();
  });
  it("renders nothing for a trainee entry", () => {
    const { container } = render(<CoachLogBadge loggedByRole="trainee" timeZone={tz} />);
    expect(container.textContent).toBe("");
  });
});
