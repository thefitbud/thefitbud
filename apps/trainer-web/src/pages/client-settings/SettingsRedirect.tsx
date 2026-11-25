import { Navigate, useLocation, useParams } from "react-router-dom";
import { type SettingsSectionId } from "./settingsSections";

/**
 * D-W13-15: `/clients/:id/configure` and `/clients/:id/onboarding` are linked
 * from files other tasks own (and from bookmarks), so they keep working as
 * redirects into the Settings tab section that replaced them. The query string
 * is kept; the hash names the section.
 */
export function ClientSettingsRedirect({ section }: { section: SettingsSectionId }) {
  const { relationshipId = "" } = useParams();
  const { search } = useLocation();
  return (
    <Navigate
      replace
      to={{
        pathname: `/clients/${relationshipId}/settings`,
        search,
        hash: `#${section}`,
      }}
    />
  );
}
