import type { ClientFacets } from "@fitbud/contracts";

/**
 * Roster counts from the facets every `GET /clients` page carries (Z14-21),
 * so no screen needs to load the whole roster just to count it.
 */
export type FacetCounts = {
  /** Active, invited and onboarding clients; ended ones are counted apart. */
  all: number;
  needs: number;
  onboarding: number;
  invites: number;
  ended: number;
};

export function countsFromFacets(facets: ClientFacets): FacetCounts {
  const status = facets.status;
  const ended = status["ended"] ?? 0;
  const total = Object.values(status).reduce((sum, n) => sum + n, 0);
  return {
    all: total - ended,
    needs: facets.adherence["needs_attention"] ?? 0,
    onboarding:
      (status["onboarding_pending"] ?? 0) + (status["onboarding_submitted"] ?? 0),
    invites: status["invited"] ?? 0,
    ended,
  };
}
