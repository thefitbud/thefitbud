import { describe, expect, it } from "vitest";
import { parseDeepLinkUrl, routeFromParsedLink } from "./linking.js";

describe("parseDeepLinkUrl", () => {
  it("parses https /go/ links", () => {
    expect(
      parseDeepLinkUrl(
        "https://fitbud.app/go/meal/11111111-1111-4111-8111-111111111111",
      ),
    ).toEqual({
      kind: "meal",
      id: "11111111-1111-4111-8111-111111111111",
      query: {},
    });
  });

  it("parses fitbud scheme", () => {
    expect(
      parseDeepLinkUrl("fitbud://workout/22222222-2222-4222-8222-222222222222"),
    ).toEqual({
      kind: "workout",
      id: "22222222-2222-4222-8222-222222222222",
      query: {},
    });
  });

  it("parses notification-style paths", () => {
    expect(
      parseDeepLinkUrl("/checkin/33333333-3333-4333-8333-333333333333")?.kind,
    ).toBe("checkin");
  });
});

describe("routeFromParsedLink", () => {
  it("maps kinds to app routes", () => {
    expect(
      routeFromParsedLink({
        kind: "workout",
        id: "a",
      }),
    ).toEqual({ type: "workout_overview", assignmentId: "a" });
    expect(routeFromParsedLink({ kind: "reactivate", id: "r" })).toEqual({
      type: "reactivate",
      requestId: "r",
    });
  });
});
