import { FitBudApiClient } from "@fitbud/api-client";
import { getStoredAccessToken } from "./session";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "/api";

/** Prefix a relative API path, including signed file download URLs. */
export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export const apiClient = new FitBudApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken: () => getStoredAccessToken(),
  getSelectedRole: () => "trainer",
});
