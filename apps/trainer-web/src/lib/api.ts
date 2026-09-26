import { FitBudApiClient } from "@fitbud/api-client";
import { getStoredAccessToken } from "./session";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "/api";

export const apiClient = new FitBudApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken: () => getStoredAccessToken(),
  getSelectedRole: () => "trainer",
});
