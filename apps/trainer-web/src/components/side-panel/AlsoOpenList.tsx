import { Link } from "react-router-dom";
import { ClipboardCheck, Dumbbell, Utensils } from "lucide-react";
import { formatCivilDate, labelFor } from "@fitbud/core";
import type { Exception } from "@fitbud/contracts";
import { StatusChip } from "../StatusChip";

function SourceIcon({ type }: { type: Exception["sourceEntityType"] }) {
  const props = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;
  if (type === "workout_assignment") return <Dumbbell {...props} />;
  if (type === "meal_assignment") return <Utensils {...props} />;
  return <ClipboardCheck {...props} />;
}

/** Short row label, e.g. "Missed workout · Thu 15 Oct". */
export function itemShortLabel(item: Pick<Exception, "type" | "details">): string {
  const base = labelFor("exception_type", item.type);
  const raw = item.details?.localDate;
  const localDate = typeof raw === "string" && raw.trim() ? raw : null;
  return localDate ? `${base} · ${formatCivilDate(localDate)}` : base;
}

/**
 * "Also open for {first name}" (frame 02): the client's other unresolved
 * items, numbered by their place in the panel. Selecting one moves there.
 */
export function AlsoOpenList({
  firstName,
  items,
  currentId,
  resolvedIds,
  moreCount,
  clientHref,
  onSelect,
  onLeave,
}: {
  firstName: string;
  items: readonly Exception[];
  currentId: string | null;
  resolvedIds: ReadonlySet<string>;
  moreCount: number;
  clientHref: string;
  onSelect: (index: number) => void;
  /** A plain click on "Open client" leaves the panel (DR1 closing flag). */
  onLeave?: () => void;
}) {
  const rows = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.id !== currentId && !resolvedIds.has(item.id));
  if (rows.length === 0 && moreCount === 0) return null;
  return (
    <section className="sp-section" aria-labelledby="sp-also-open">
      <h3 id="sp-also-open" className="sp-section-title">
        Also open for {firstName}
      </h3>
      {rows.length > 0 ? (
        <ul className="sp-also">
          {rows.map(({ item, index }) => (
            <li key={item.id}>
              <button
                type="button"
                className="sp-also-row"
                onClick={() => onSelect(index)}
              >
                <SourceIcon type={item.sourceEntityType} />
                <span className="sp-also-label">
                  {index + 1} · {itemShortLabel(item)}
                </span>
                <StatusChip kind="severity" value={item.severity} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {moreCount > 0 ? (
        <p className="sp-more">
          {moreCount} more open {moreCount === 1 ? "item" : "items"} ·{" "}
          <Link
            className="link"
            to={clientHref}
            onClick={(ev) => {
              if (
                ev.button === 0 &&
                !ev.metaKey &&
                !ev.ctrlKey &&
                !ev.shiftKey &&
                !ev.altKey
              ) {
                onLeave?.();
              }
            }}
          >
            Open client
          </Link>
        </p>
      ) : null}
    </section>
  );
}
