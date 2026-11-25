/**
 * Z14-45: "Submit intake" on the last step.
 *
 * Root cause: `goNext()` saved the draft (server version v -> v+1) and then
 * `submit()` saved again from the same closure with the stale `version`, so
 * the API answered 409 ONBOARDING_VERSION_CONFLICT and `submitOnboarding`
 * never ran; the catch then reloaded through the full-screen "Loading…" and
 * wiped the message.
 *
 * The real `FitBudApiClient` runs against a fake transport that keeps a
 * server-side draft version and refuses a stale `expectedVersion` the way
 * `apps/api/src/routes/onboarding.ts` does, so the version check is not
 * mocked away.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FitBudApiClient } from "@fitbud/api-client";
import { fireEvent, render, screen, waitFor } from "../test/render";

const RELATIONSHIP_ID = "6f1d2a4e-0c1b-4b8e-9a53-1f4f7c1d2e01";
const FORM_ID = "6f1d2a4e-0c1b-4b8e-9a53-1f4f7c1d2e02";
const TRAINEE_ID = "6f1d2a4e-0c1b-4b8e-9a53-1f4f7c1d2e03";
const NOW = "2026-11-20T09:00:00.000Z";

const FIELDS = [
  { id: "goal", label: "What is your main goal?", required: true },
  { id: "routine", label: "Describe a usual day", required: true },
  { id: "food", label: "What do you usually eat?", required: true },
  { id: "health", label: "Anything about your health?", required: false },
  { id: "extra", label: "Anything else for your coach?", required: true },
].map((f) => ({ ...f, type: "textarea" as const }));

type Call = { method: string; path: string; body: { expectedVersion?: number; answers?: Record<string, unknown> } | undefined; key: string | null };

class FakeServer {
  version = 0;
  status: "draft" | "submitted" = "draft";
  answers: Record<string, unknown> = {};
  calls: Call[] = [];
  /** Forced outcomes for the next submit POSTs. */
  submitFailures: Array<() => Response> = [];

  json(status: number, body: unknown, envelope = true) {
    return new Response(JSON.stringify(envelope && status < 400 ? { data: body } : body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  error(status: number, code: string, message: string) {
    return this.json(status, { error: { code, message, requestId: "req-1" } });
  }

  response() {
    return {
      id: "6f1d2a4e-0c1b-4b8e-9a53-1f4f7c1d2e04",
      coachingRelationshipId: RELATIONSHIP_ID,
      onboardingFormVersionId: FORM_ID,
      traineeUserId: TRAINEE_ID,
      status: this.status,
      answers: this.answers,
      version: this.version,
      submittedAt: this.status === "submitted" ? NOW : null,
      createdAt: NOW,
      updatedAt: NOW,
    };
  }

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const path = String(input).replace("https://api.test", "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const key =
      (init?.headers as Record<string, string> | undefined)?.["Idempotency-Key"] ?? null;
    this.calls.push({ method, path, body, key });

    if (method === "GET" && path.includes("/onboarding/") && path.includes("current")) {
      return this.json(200, {
        id: FORM_ID,
        templateId: "6f1d2a4e-0c1b-4b8e-9a53-1f4f7c1d2e05",
        key: "intake",
        version: 1,
        scope: "global",
        fields: FIELDS,
        createdAt: NOW,
      });
    }
    if (method === "GET" && path === `/onboarding/relationships/${RELATIONSHIP_ID}`) {
      return this.json(200, this.response());
    }
    if (method === "PUT" && path.endsWith("/draft")) {
      if (body?.expectedVersion !== this.version) {
        return this.error(409, "ONBOARDING_VERSION_CONFLICT", "Draft changed.");
      }
      this.answers = body?.answers ?? {};
      this.version += 1;
      return this.json(200, this.response());
    }
    if (method === "POST" && path.endsWith("/submit")) {
      const forced = this.submitFailures.shift();
      if (forced) return forced();
      if (body?.expectedVersion !== this.version) {
        return this.error(409, "ONBOARDING_VERSION_CONFLICT", "Draft changed.");
      }
      this.status = "submitted";
      this.version += 1;
      return this.json(200, this.response());
    }
    return this.error(404, "NOT_FOUND", "Not found.");
  };
}

let server: FakeServer;
const refreshSession = vi.fn(async () => undefined);
const auth: Record<string, unknown> = {};

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});

const { IntakeScreen } = await import("./IntakeScreen");

function startScreen() {
  server = new FakeServer();
  auth.api = new FitBudApiClient({
    baseUrl: "https://api.test",
    fetch: server.fetch as typeof fetch,
  });
  auth.refreshSession = refreshSession;
  render(<IntakeScreen relationshipId={RELATIONSHIP_ID} />);
}

async function onFirstStep() {
  await waitFor(() => expect(screen.getByText("What is your main goal?")).toBeTruthy());
}

/** Fill every text box on the current step, optionally leaving the first one empty. */
function fillStep(value: string, skipFirst = false) {
  const inputs = Array.from(document.querySelectorAll("textarea, input")) as HTMLElement[];
  inputs.forEach((input, i) => {
    if (skipFirst && i === 0) return;
    fireEvent.change(input, { target: { value } });
  });
}

function press(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}

/** Answer every question and stop on the last step with Submit intake showing. */
async function reachLastStep() {
  await onFirstStep();
  fillStep("Lose 5 kg before the wedding");
  press(/Continue/);
  await waitFor(() => expect(screen.getByText("Anything about your health?")).toBeTruthy());
  fillStep("Answered");
  await waitFor(() => expect(screen.getByRole("button", { name: /Submit intake/ })).toBeTruthy());
}

function writesTo(suffix: string) {
  return server.calls.filter((c) => c.path.endsWith(suffix) && c.method !== "GET");
}

const CONFLICT_COPY =
  "Your answers were updated somewhere else. Check them and submit again.";

beforeEach(() => {
  refreshSession.mockClear();
});

describe("Submit intake (Z14-45)", () => {
  it("one save, then one submit with the version that save returned, then refreshSession", async () => {
    startScreen();
    await reachLastStep();
    const draftsBefore = writesTo("/draft").length;

    press(/Submit intake/);
    await waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(1));

    expect(writesTo("/draft").length - draftsBefore).toBe(1);
    const submits = writesTo("/submit");
    expect(submits).toHaveLength(1);
    // The fake server enforces expectedVersion === its own version, so a stale
    // version would have answered 409 and the intake would not be submitted.
    expect(server.status).toBe("submitted");
    expect(submits[0]!.body).toEqual({ expectedVersion: server.version - 1 });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a 409 on submit keeps the banner, never shows the full-screen loading, and keeps the step", async () => {
    startScreen();
    await reachLastStep();
    // Another device saves between our draft save and our submit.
    server.submitFailures.push(() => {
      server.version += 1;
      return server.error(409, "ONBOARDING_VERSION_CONFLICT", "Draft changed.");
    });

    press(/Submit intake/);
    await waitFor(() => expect(screen.getByText(CONFLICT_COPY)).toBeTruthy());
    // Let the background refetch settle, then check nothing wiped the banner.
    await waitFor(() =>
      expect(
        server.calls.filter(
          (c) => c.method === "GET" && c.path === `/onboarding/relationships/${RELATIONSHIP_ID}`,
        ),
      ).toHaveLength(2),
    );
    expect(screen.queryByText("Loading…")).toBeNull();
    expect(screen.getByText(CONFLICT_COPY)).toBeTruthy();
    expect(screen.getByText("Anything else for your coach?")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Submit intake/ })).toBeTruthy();
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("an empty required question on an earlier step sends nothing and shows the line under it", async () => {
    startScreen();
    await onFirstStep();
    // Leave step 1's first required question empty, answer the rest.
    fillStep("Answered", true);
    press(/Continue/);
    await waitFor(() => expect(screen.getByText("Anything about your health?")).toBeTruthy());
    fillStep("Answered");
    await waitFor(() => expect(screen.getByRole("button", { name: /Submit intake/ })).toBeTruthy());
    const callsBefore = server.calls.length;

    press(/Submit intake/);
    await waitFor(() => expect(screen.getByText("What is your main goal?")).toBeTruthy());
    expect(screen.getByText("Answer this question to continue.")).toBeTruthy();
    expect(server.calls.length).toBe(callsBefore);
    expect(writesTo("/submit")).toHaveLength(0);
  });

  it("a network failure shows the offline copy and a second tap reuses the idempotency key", async () => {
    startScreen();
    await reachLastStep();
    server.submitFailures.push(() => {
      throw new TypeError("Network request failed");
    });

    press(/Submit intake/);
    await waitFor(() =>
      expect(screen.getByText("You're offline. We'll retry when you're back.")).toBeTruthy(),
    );
    expect(screen.queryByText("Loading…")).toBeNull();

    press(/Submit intake/);
    await waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(1));
    const submits = writesTo("/submit");
    expect(submits).toHaveLength(2);
    expect(submits[0]!.key).toBeTruthy();
    expect(submits[1]!.key).toBe(submits[0]!.key);
  });
});
