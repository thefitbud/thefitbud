import { NotFoundPage } from "../NotFoundPage";

/**
 * Z8-15 registers `/clients/:relationshipId/log-entry/*` here so Z8-16 never
 * touches `App.tsx`. Z8-16 replaces this placeholder with the meal and
 * measurement log and edit pages.
 */
export function LogEntryRoutes() {
  return <NotFoundPage />;
}
