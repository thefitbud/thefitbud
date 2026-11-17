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
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const api = vi.hoisted(() => ({
  getInvitation: vi.fn(),
  listOnboardingFormTemplates: vi.fn(),
  getOnboardingFormTemplate: vi.fn(),
  reissueInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
}));

vi.mock("../lib/api", () => ({ apiClient: api }));
vi.mock("../hooks/useOnline", () => ({ useOnline: () => true }));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    me: {
      timezone: "Asia/Kolkata",
      trainerProfile: { displayName: "Rahul Verma" },
    },
  }),
}));

import { PendingInvitationPage } from "./PendingInvitationPage";

const INVITE_ID = "06b54e81-016c-4220-a9a8-31195324669b";
const TEMPLATE_ID = "11111111-1111-4111-8111-111111111111";
const VERSION_ID = "22222222-2222-4222-8222-222222222222";

const PENDING = {
  id: INVITE_ID,
  trainerUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  recipientEmail: "anita.invite@demo.fitbud.test",
  recipientDisplayName: "Anita Desai",
  recipientWhatsappE164: "919876501111",
  status: "pending" as const,
  expiresAt: "2026-10-29T12:00:00.000Z",
  acceptedUserId: null,
  coachingRelationshipId: null,
  onboardingFormTemplateVersionId: VERSION_ID,
  onboardingStatus: "invited" as const,
  createdAt: "2026-10-15T12:40:00.000Z",
  updatedAt: "2026-10-15T12:40:00.000Z",
};

function renderPage(id = INVITE_ID) {
  render(
    <MemoryRouter initialEntries={[`/invitations/${id}`]}>
      <Routes>
        <Route
          path="/invitations/:invitationId"
          element={<PendingInvitationPage />}
        />
        <Route path="/clients/:rid" element={<div>workspace</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.getInvitation.mockResolvedValue(PENDING);
  api.listOnboardingFormTemplates.mockResolvedValue({
    items: [
      {
        id: TEMPLATE_ID,
        ownership: "global",
        trainerUserId: null,
        name: "Default onboarding",
        description: null,
        latestVersionId: VERSION_ID,
        latestVersionNumber: 3,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    nextCursor: null,
  });
  api.getOnboardingFormTemplate.mockResolvedValue({
    id: TEMPLATE_ID,
    ownership: "global",
    trainerUserId: null,
    name: "Default onboarding",
    description: null,
    latestVersionId: VERSION_ID,
    latestVersionNumber: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    versions: [
      {
        id: VERSION_ID,
        templateId: TEMPLATE_ID,
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
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PendingInvitationPage (Z12-5 / frames 144–145)", () => {
  it("shows invite header, Invite tab, stepper, formatted WhatsApp, and side cards", async () => {
    renderPage();
    const screenRoot = await screen.findByTestId("screen-TW-08");
    expect(
      within(screenRoot).getByRole("heading", { name: "Anita Desai" }),
    ).toBeTruthy();
    expect(
      within(screenRoot).getByText(/Invited .+ · Not joined yet · Link expires/i),
    ).toBeTruthy();
    expect(
      within(screenRoot).getByLabelText("Onboarding progress"),
    ).toBeTruthy();
    expect(within(screenRoot).getByText("Joined")).toBeTruthy();
    expect(within(screenRoot).getByText("Intake")).toBeTruthy();
    expect(within(screenRoot).getByText("Ready to coach")).toBeTruthy();
    expect(within(screenRoot).getByText("+91 98765 01111")).toBeTruthy();
    expect(
      within(screenRoot).getByText(/FitBud standard intake · v3/i),
    ).toBeTruthy();
    expect(within(screenRoot).getByText(/Sent .+ · expires /i)).toBeTruthy();
    expect(
      within(screenRoot).getByText(
        /Copy new link replaces the old one\. The old link will stop working\./i,
      ),
    ).toBeTruthy();
    expect(within(screenRoot).getByText("What happens next")).toBeTruthy();
    expect(within(screenRoot).getByText("Timeline")).toBeTruthy();
    expect(
      within(screenRoot).getByRole("link", { name: /Remind on WhatsApp/i }),
    ).toBeTruthy();
    expect(
      within(screenRoot).getByText(/^Invite$/),
    ).toBeTruthy();
  });

  it("opens a revoke modal with Anita possessive title", async () => {
    renderPage();
    await screen.findByTestId("screen-TW-08");
    fireEvent.click(screen.getByRole("button", { name: /More actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Revoke invite/i }));
    const dialog = await screen.findByRole("dialog", {
      name: /Revoke Anita's invite\?/i,
    });
    expect(
      within(dialog).getByText(/stops working right away/i),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: /^Revoke invite$/i }),
    ).toBeTruthy();
  });

  it("revokes and shows read-only revoked state", async () => {
    api.revokeInvitation.mockResolvedValue({
      ...PENDING,
      status: "revoked",
      updatedAt: "2026-10-17T10:00:00.000Z",
    });
    renderPage();
    await screen.findByTestId("screen-TW-08");
    fireEvent.click(screen.getByRole("button", { name: /More actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Revoke invite/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /^Revoke invite$/i }),
    );
    await waitFor(() => {
      expect(api.revokeInvitation).toHaveBeenCalledWith(INVITE_ID);
    });
    expect(await screen.findByText(/Revoked on /i)).toBeTruthy();
    expect(
      screen.getByText("Revoked", { selector: ".pending-invite-pill span" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: /Remind on WhatsApp/i }),
    ).toBeNull();
  });

  it("confirms reissue before creating a new link", async () => {
    const nextId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    api.reissueInvitation.mockResolvedValue({
      ...PENDING,
      id: nextId,
      inviteUrl: "https://app.example.test/i/new-token",
      token: "new-token",
    });
    renderPage();
    await screen.findByTestId("screen-TW-08");
    fireEvent.click(screen.getByRole("button", { name: /Copy new link/i }));
    expect(
      screen.getByText(/Create a new link\? The old link will stop working\./i),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /Create new link/i }),
    );
    await waitFor(() => {
      expect(api.reissueInvitation).toHaveBeenCalledWith(INVITE_ID);
    });
  });

  it("redirects accepted invites to the workspace", async () => {
    api.getInvitation.mockResolvedValue({
      ...PENDING,
      status: "accepted",
      coachingRelationshipId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });
    renderPage();
    expect(await screen.findByText("workspace")).toBeTruthy();
  });
});
