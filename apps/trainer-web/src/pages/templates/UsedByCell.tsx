import type { TemplateUsedBy } from "@fitbud/contracts";
import { avatarTone, clientInitials, type ApplyClient } from "./shared";

/**
 * "Used by" cell (W-168). Up to three avatars plus a count, from the list
 * response's `usedBy`. "Not used yet" only when the count really is 0
 * (D-WEB-2); a row with no `usedBy` at all (forms) shows a dash.
 */
export function UsedByCell({
  usedBy,
  clients,
}: {
  usedBy: TemplateUsedBy | null | undefined;
  clients: ApplyClient[];
}) {
  if (!usedBy) {
    return (
      <span className="templates-used-none" data-testid="used-by-unknown">
        —
      </span>
    );
  }
  if (usedBy.count === 0) {
    return (
      <span className="templates-used-none" data-testid="used-by-empty">
        Not used yet
      </span>
    );
  }
  const shown = usedBy.clientIds.slice(0, 3);
  const everyone = clients.length > 1 && usedBy.count === clients.length;
  const label = everyone
    ? "All clients"
    : usedBy.count === 1
      ? "1 client"
      : `${usedBy.count} clients`;
  return (
    <span className="templates-used" data-testid="used-by">
      <span className="ui-av-stack" aria-hidden="true">
        {shown.map((id) => {
          const client = clients.find((c) => c.relationshipId === id);
          const name = client?.traineeDisplayName ?? "";
          return (
            <span
              key={id}
              className={`ui-av is-sm ui-av${avatarTone(id)}`}
              data-testid="used-by-avatar"
            >
              {name ? clientInitials(name) : "·"}
            </span>
          );
        })}
      </span>
      <span className="templates-used-n">{label}</span>
    </span>
  );
}
