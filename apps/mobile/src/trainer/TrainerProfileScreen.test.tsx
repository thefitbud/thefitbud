import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import { fireEvent, mockAuth, render, screen, waitFor } from "../test/render";

const setPassword = vi.fn();
const auth = mockAuth({
  api: { setPassword },
  me: {
    email: "rahul.coach@demo.fitbud.test",
    timezone: "Asia/Kolkata",
    trainerProfile: {
      displayName: "Rahul Verma",
      whatsappE164: "+919820041736",
    },
  },
});
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => auth }));

import { TrainerProfileScreen } from "./TrainerProfileScreen";

function openPasswordForm() {
  const onBack = vi.fn();
  render(<TrainerProfileScreen onBack={onBack} />);
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
  fireEvent.change(screen.getByLabelText("Current password"), {
    target: { value: "OldPassword-1" },
  });
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: "NewPassword-2" },
  });
  return onBack;
}

describe("trainer profile change password (frame 55)", () => {
  beforeEach(() => setPassword.mockReset());

  it("shows the API's own message when the current password is wrong", async () => {
    setPassword.mockRejectedValueOnce(
      new ApiClientError({
        code: "INVALID_CREDENTIALS",
        message: "Current password is incorrect.",
        requestId: "r1",
        status: 401,
      }),
    );
    openPasswordForm();
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    await screen.findByText("Current password is incorrect.");
    expect(setPassword).toHaveBeenCalledWith({
      currentPassword: "OldPassword-1",
      newPassword: "NewPassword-2",
    });
  });

  it("shows a short code, not a guessed cause, for other failures", async () => {
    setPassword.mockRejectedValueOnce(new Error("network down"));
    openPasswordForm();
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    await screen.findByText("PASSWORD-SAVE");
  });

  it("returns to Profile after success", async () => {
    setPassword.mockResolvedValue(undefined);
    openPasswordForm();
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    await screen.findByText("Password updated.");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => screen.getByText("Mobile / WhatsApp"));
  });
});
