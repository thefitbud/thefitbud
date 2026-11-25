/**
 * Z14-46: the intake follows TR-03. Steps follow the form (D-W14-45), the
 * header is the close button plus "Step n of N", the footer has Back and
 * Continue, and the close button opens "Finish later?" (D-W14-46).
 *
 * Runs the real `FitBudApiClient` against a fake transport, like the
 * Z14-45 submit test, with the default 5-question global form.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FitBudApiClient } from "@fitbud/api-client";
import { fireEvent, render, screen, waitFor } from "../test/render";

const RELATIONSHIP_ID = "6f1d2a4e-0c1b-4b8e-9a53-1f4f7c1d2e01";
const FORM_ID = "6f1d2a4e-0c1b-4b8e-9a53-1f4f7c1d2e02";
const NOW = "2026-11-20T09:00:00.000Z";

const DEFAULT_FIELDS = [
  { id: "goals", label: "Goals", required: true },
  { id: "history", label: "Relevant history", required: false },
  { id: "preferences", label: "Preferences", required: false },
  { id: "schedule", label: "Schedule", required: false },
  { id: "limitations", label: "Limitations", required: false },
].map((f) => ({ ...f, type: "textarea" as const }));

let fields: Array<Record<string, unknown>> = DEFAULT_FIELDS;
let failDraft = false;
let version = 0;
let answers: Record<string, unknown> = {};
let formLoadFails = false;

const signOut = vi.fn();
const auth: Record<string, unknown> = {};

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});

const { IntakeScreen } = await import("./IntakeScreen");

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(status < 400 ? { data: body } : body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = String(input).replace("https://api.test", "");
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  if (method === "GET" && path.includes("current")) {
    if (formLoadFails) throw new TypeError("Network request failed");
    return json(200, {
      id: FORM_ID,
      templateId: "6f1d2a4e-0c1b-4b8e-9a53-1f4f7c1d2e05",
      key: "intake",
      version: 1,
      scope: "global",
      fields,
      createdAt: NOW,
    });
  }
  const response = () => ({
    id: "6f1d2a4e-0c1b-4b8e-9a53-1f4f7c1d2e04",
    coachingRelationshipId: RELATIONSHIP_ID,
    onboardingFormVersionId: FORM_ID,
    traineeUserId: "6f1d2a4e-0c1b-4b8e-9a53-1f4f7c1d2e03",
    status: "draft",
    answers,
    version,
    submittedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  if (method === "GET" && path === `/onboarding/relationships/${RELATIONSHIP_ID}`) {
    return json(200, response());
  }
  if (method === "PUT" && path.endsWith("/draft")) {
    if (failDraft) throw new TypeError("Network request failed");
    answers = body.answers;
    version += 1;
    return json(200, response());
  }
  return json(404, { error: { code: "NOT_FOUND", message: "Not found.", requestId: "r" } });
};

function start() {
  auth.api = new FitBudApiClient({
    baseUrl: "https://api.test",
    fetch: fakeFetch as typeof fetch,
  });
  auth.refreshSession = vi.fn(async () => undefined);
  auth.signOut = signOut;
  render(<IntakeScreen relationshipId={RELATIONSHIP_ID} />);
}

const press = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  fields = DEFAULT_FIELDS;
  failDraft = false;
  formLoadFails = false;
  version = 0;
  answers = {};
  signOut.mockClear();
});

describe("Intake layout (Z14-46)", () => {
  it("the default form is Step 1 of 2, with no fixed step titles and no Back on step 1", async () => {
    start();
    await waitFor(() => expect(screen.getByText("Step 1 of 2")).toBeTruthy());
    expect(screen.getByText("Getting to know you")).toBeTruthy();
    expect(screen.getByText("Preferences")).toBeTruthy();
    expect(screen.queryByText("Schedule")).toBeNull();
    expect(screen.queryByText("About you")).toBeNull();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    // Before any save, nothing under the buttons.
    expect(screen.queryByText("Answers saved")).toBeNull();
  });

  it("Continue saves, goes to the last step with Back and Submit intake, and Back returns", async () => {
    start();
    await waitFor(() => expect(screen.getByText("Step 1 of 2")).toBeTruthy());
    press(/^Continue$/);
    await waitFor(() => expect(screen.getByText("Step 2 of 2")).toBeTruthy());
    expect(screen.getByText("Schedule")).toBeTruthy();
    expect(screen.getByText("Limitations")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submit intake" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.getByText("Answers saved")).toBeTruthy();

    press(/^Back$/);
    await waitFor(() => expect(screen.getByText("Step 1 of 2")).toBeTruthy());
  });

  it("a 16 question form is 5 steps", async () => {
    fields = Array.from({ length: 16 }, (_, i) => ({
      id: `q${i}`,
      type: "text",
      label: `Question ${i + 1}`,
      required: false,
    }));
    start();
    await waitFor(() => expect(screen.getByText("Step 1 of 5")).toBeTruthy());
  });

  it("a required sleep question shows its stepper value and stores it", async () => {
    fields = [
      { id: "sleep", type: "number", label: "Hours of sleep on a usual night", required: true },
    ];
    start();
    await waitFor(() => expect(screen.getByText("Hours of sleep on a usual night")).toBeTruthy());
    press(/^Submit intake$/);
    await waitFor(() => expect(answers.sleep).toBe(6.5));
  });

  it("the close button opens Finish later?, saves first, and Keep going closes it", async () => {
    start();
    await waitFor(() => expect(screen.getByText("Step 1 of 2")).toBeTruthy());
    press(/^Close$/);
    await waitFor(() => expect(screen.getByText("Finish later?")).toBeTruthy());
    expect(version).toBe(1);
    expect(
      screen.getByText("Your answers are saved. Sign in again any time to carry on."),
    ).toBeTruthy();
    press(/^Keep going$/);
    // react-native-web keeps a slide Modal mounted until its animation ends.
    for (let node: HTMLElement | null = screen.getByText("Finish later?"); node; node = node.parentElement) {
      fireEvent.animationEnd(node);
    }
    await waitFor(() => expect(screen.queryByText("Finish later?")).toBeNull());
    expect(signOut).not.toHaveBeenCalled();
  });

  it("Sign out from the sheet calls signOut", async () => {
    start();
    await waitFor(() => expect(screen.getByText("Step 1 of 2")).toBeTruthy());
    press(/^Close$/);
    await waitFor(() => expect(screen.getByText("Finish later?")).toBeTruthy());
    press(/^Sign out$/);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("when the save fails the sheet says so and still offers both actions", async () => {
    start();
    await waitFor(() => expect(screen.getByText("Step 1 of 2")).toBeTruthy());
    failDraft = true;
    press(/^Close$/);
    await waitFor(() =>
      expect(screen.getByText("We couldn't save your last answers. Sign out anyway?")).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "Keep going" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("loading is the spinner state, not bare text, and a load error keeps the close button", async () => {
    formLoadFails = true;
    start();
    expect(screen.queryByText("Loading…")).toBeNull();
    expect(screen.getByLabelText("Loading")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText("You're offline. We'll retry when you're back.")).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    press(/^Close$/);
    await waitFor(() => expect(screen.getByText("Finish later?")).toBeTruthy());
    press(/^Sign out$/);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
