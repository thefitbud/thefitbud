/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";

const api = vi.hoisted(() => ({
  listOnboardingFormTemplates: vi.fn(),
  getOnboardingFormTemplate: vi.fn(),
  createInvitation: vi.fn(),
  listClients: vi.fn(),
  getRelationship: vi.fn(),
}));

vi.mock("../lib/api", () => ({ apiClient: api }));
vi.mock("../hooks/useOnline", () => ({ useOnline: () => true }));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    me: {
      trainerProfile: { displayName: "Rahul Verma" },
    },
  }),
}));
vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(async () => "data:image/png;base64,qq"),
  },
}));

import { AddClientPage } from "./AddClientPage";

const TEMPLATE = {
  id: "11111111-1111-4111-8111-111111111111",
  ownership: "global" as const,
  trainerUserId: null,
  name: "Default onboarding",
  description: null,
  latestVersionId: "22222222-2222-4222-8222-222222222222",
  latestVersionNumber: 3,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/clients/add"]}>
      <AddClientPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.listOnboardingFormTemplates.mockResolvedValue({
    items: [TEMPLATE],
    nextCursor: null,
  });
  api.getOnboardingFormTemplate.mockResolvedValue({
    ...TEMPLATE,
    versions: [
      {
        id: TEMPLATE.latestVersionId,
        templateId: TEMPLATE.id,
        key: "default",
        version: 3,
        scope: "global",
        fields: [
          {
            id: "goals",
            type: "textarea",
            label: "Goals",
            required: true,
          },
        ],
        createdAt: TEMPLATE.createdAt,
      },
    ],
  });
  api.listClients.mockResolvedValue({
    items: [
      {
        relationshipId: "33333333-3333-4333-8333-333333333333",
        invitationId: null,
        traineeDisplayName: "Kavya Nair",
        status: "ended",
        goalShort: null,
        nextCheckin: null,
        effectivePlan: null,
        adherenceState: "not_available",
        renewalState: null,
        renewsOn: null,
        updatedAt: "2026-10-03T06:00:00.000Z",
        endedOn: "2026-10-03",
        endedAt: "2026-10-03T06:00:00.000Z",
      },
    ],
    facets: { status: {}, adherence: {}, renewal: {} },
    nextCursor: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AddClientPage form (frame 141)", () => {
  it("left-aligns the title, shows helpers, Cancel, and global template · vN", async () => {
    renderPage();
    expect(screen.getByTestId("screen-TW-07")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Add client" })).toBeTruthy();
    expect(screen.queryByText(/Clients \/ Add/i)).toBeNull();
    expect(screen.queryByText(/Invite someone to coaching/i)).toBeNull();

    await waitFor(() =>
      expect(
        screen.getByRole("option", {
          name: /FitBud standard intake \(global\) · v3/,
        }),
      ).toBeTruthy(),
    );
    expect(
      screen.getByText("Used to sign in and for sign-in codes."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Your client can sign in with this number, and you can message them on WhatsApp from FitBud/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Preview what your client will see/i }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Cancel$/i })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /^Create invite$/i }),
    ).toBeTruthy();
    expect(screen.getByText("You create the invite and share the link.")).toBeTruthy();
  });

  it("personalises the preview link from the client name", async () => {
    renderPage();
    await screen.findByRole("option", {
      name: /FitBud standard intake \(global\) · v3/,
    });
    fireEvent.change(screen.getByLabelText(/^Client name$/i), {
      target: { value: "Kriti Malhotra" },
    });
    expect(
      screen.getByRole("button", { name: /Preview what Kriti will see/i }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Kriti joins, sets a password and fills the intake/),
    ).toBeTruthy();
  });
});

describe("AddClientPage reactivate (frame 143)", () => {
  it("shows the info banner and Reactivate primary instead of a red form error", async () => {
    api.createInvitation.mockRejectedValue(
      new ApiClientError({
        code: "CLIENT_ENDED",
        message: "This client coached with you before. Reactivate instead.",
        status: 409,
        requestId: "req-ended",
        details: {
          relationshipId: "33333333-3333-4333-8333-333333333333",
        },
      }),
    );
    renderPage();
    await screen.findByRole("option", {
      name: /FitBud standard intake \(global\) · v3/,
    });
    fireEvent.change(screen.getByLabelText(/^Client name$/i), {
      target: { value: "Kavya Nair" },
    });
    fireEvent.change(screen.getByLabelText(/^Email$/i), {
      target: { value: "kavya.ended@demo.fitbud.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Create invite$/i }));

    await waitFor(() =>
      expect(screen.getByTestId("reactivate-client-link")).toBeTruthy(),
    );
    const banner = screen.getByTestId("add-client-error");
    expect(banner.className).toContain("add-client-reactivate-banner");
    expect(banner.textContent).toMatch(/coached with you until/i);
    expect(banner.textContent).toMatch(/Sat 3 Oct|3 Oct/i);
    expect(
      screen.getByRole("link", { name: /^Reactivate$/i }).getAttribute("href"),
    ).toBe("/clients/33333333-3333-4333-8333-333333333333");
    expect(
      screen.getByRole("button", { name: /Create a new invite/i }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Reactivating sends Kavya a request they confirm/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Create invite$/i })).toBeNull();
  });
});

describe("AddClientPage success (frame 142)", () => {
  it("shows the preview bubble and inline share actions", async () => {
    api.createInvitation.mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
      trainerUserId: "55555555-5555-4555-8555-555555555555",
      recipientEmail: "kriti.malhotra@gmail.com",
      recipientDisplayName: "Kriti Malhotra",
      recipientWhatsappE164: "919930012458",
      inviteUrl: "https://fitbud.app/go/invite/Qm4tZ",
      token: "tok-once",
      expiresAt: "2026-11-01T00:00:00.000Z",
      status: "pending",
      acceptedUserId: null,
      coachingRelationshipId: null,
      onboardingFormTemplateVersionId: TEMPLATE.latestVersionId,
      onboardingStatus: "invited",
      createdAt: "2026-10-18T00:00:00.000Z",
      updatedAt: "2026-10-18T00:00:00.000Z",
    });
    renderPage();
    await screen.findByRole("option", {
      name: /FitBud standard intake \(global\) · v3/,
    });
    fireEvent.change(screen.getByLabelText(/^Client name$/i), {
      target: { value: "Kriti Malhotra" },
    });
    fireEvent.change(screen.getByLabelText(/^Email$/i), {
      target: { value: "kriti.malhotra@gmail.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/98765/i), {
      target: { value: "9930012458" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Create invite$/i }));

    await waitFor(() =>
      expect(screen.getByTestId("invite-share-card")).toBeTruthy(),
    );
    expect(screen.getByText(/Invite ready for Kriti/i)).toBeTruthy();
    expect(
      screen.getByText(
        /Hi Kriti, I've set up your coaching on FitBud\. Join here:/,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Signed as you, Rahul Verma/i)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Send on WhatsApp/i }).getAttribute("href"),
    ).toMatch(/wa\.me/);
    expect(
      screen.getByRole("button", { name: /Copy invite link/i }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Email invite/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^QR code$/i })).toBeTruthy();
    expect(screen.queryByText("What happens next")).toBeNull();
  });
});
