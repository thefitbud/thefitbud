import { Link, useNavigate } from "react-router-dom";
import type { ClientDirectoryItem } from "@fitbud/contracts";
import { formatCivilDate, formatPersonName } from "@fitbud/core";
import { StatusChip } from "./StatusChip";
import {
  directoryWorkspaceHref,
  primaryActionForStatus,
} from "../lib/clients";

function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  const first = words[0];
  const second = words[1];
  if (first && second) {
    return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase() || "CL";
  }
  return ((words[0] ?? "").slice(0, 2) || "CL").toUpperCase();
}

function avatarTone(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash + name.charCodeAt(i) * (i + 1)) % 8;
  }
  return `av-c${(hash % 8) + 1}`;
}

/** Relative-ish next check-in from a civil date (en-IN). */
function nextCheckinLabel(localDate: string): string {
  const parts = localDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return formatCivilDate(localDate);
  }
  const [y, m, d] = parts as [number, number, number];
  const target = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((target - today) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1 && days < 14) return `in ${days} d`;
  if (days < -1 && days > -14) return `${Math.abs(days)} d ago`;
  return formatCivilDate(localDate);
}

type Props = {
  item: ClientDirectoryItem;
  selected?: boolean;
  layout?: "row" | "card";
};

export function ClientRow({
  item,
  selected = false,
  layout = "row",
}: Props) {
  const navigate = useNavigate();
  const name = formatPersonName(item.traineeDisplayName);
  const action = primaryActionForStatus(item.status, item.invitationId);
  const href = directoryWorkspaceHref(item);
  const goal = item.goalShort?.trim() || null;
  const planTitle = item.effectivePlan?.title?.trim() || null;
  const checkinLabel = item.nextCheckin
    ? nextCheckinLabel(item.nextCheckin.localDate)
    : null;

  const primaryAction = href ? (
    <Link
      to={href}
      className="button-tinted btn-sm client-row-cta"
      onClick={(e) => e.stopPropagation()}
    >
      {action.label}
    </Link>
  ) : (
    <span className="muted-dash">—</span>
  );

  function activate() {
    if (href) navigate(href);
  }

  if (layout === "card") {
    return (
      <article
        className={`client-card${selected ? " is-selected" : ""}`}
        tabIndex={0}
        data-client-row
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === "Enter") activate();
        }}
      >
        <div className="roster-person">
          <span className={`av ${avatarTone(name)}`} aria-hidden="true">
            {initials(name)}
          </span>
          <div>
            <p className="client-name">{name}</p>
            <p className="client-subtitle">{goal ?? "—"}</p>
          </div>
        </div>
        <div className="client-card-chips">
          <StatusChip kind="lifecycle" value={item.status} />
          {item.status === "ended" && item.endedAt ? (
            <span className="status-chip status-chip-xs">
              Ended {formatCivilDate(item.endedAt.slice(0, 10))}
            </span>
          ) : null}
          <StatusChip kind="adherence" value={item.adherenceState} />
          {item.renewalState &&
          (item.renewalState === "upcoming" ||
            item.renewalState === "due" ||
            item.renewalState === "expired") ? (
            <StatusChip kind="renewal" value={item.renewalState} />
          ) : null}
        </div>
        <p className="client-card-meta">
          Next check-in: {checkinLabel ?? "—"}
        </p>
        <div className="client-card-action">{primaryAction}</div>
      </article>
    );
  }

  return (
    <tr
      className={selected ? "is-selected" : undefined}
      data-client-row
      tabIndex={0}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === "Enter") activate();
      }}
    >
      <td>
        <div className="roster-person">
          <span className={`av ${avatarTone(name)}`} aria-hidden="true">
            {initials(name)}
          </span>
          <div className="roster-person-copy">
            <p className="client-name">{name}</p>
            <p className="client-subtitle muted">{goal ?? "—"}</p>
          </div>
        </div>
      </td>
      <td>
        <div className="roster-status-cell">
          <StatusChip kind="lifecycle" value={item.status} />
          {item.status === "ended" && item.endedAt ? (
            <span className="status-chip status-chip-xs">
              Ended {formatCivilDate(item.endedAt.slice(0, 10))}
            </span>
          ) : null}
        </div>
      </td>
      <td>
        <StatusChip kind="adherence" value={item.adherenceState} />
      </td>
      <td>
        <span className={checkinLabel ? undefined : "muted-dash"}>
          {checkinLabel ?? "—"}
        </span>
      </td>
      <td>
        {planTitle ? (
          <span className="roster-plan" title={planTitle}>
            {planTitle}
          </span>
        ) : (
          <span className="muted-dash">—</span>
        )}
      </td>
      <td>
        {item.renewalState &&
        (item.renewalState === "upcoming" ||
          item.renewalState === "due" ||
          item.renewalState === "expired") ? (
          <StatusChip kind="renewal" value={item.renewalState} />
        ) : (
          <span className="muted-dash">—</span>
        )}
      </td>
      <td className="client-row-action">{primaryAction}</td>
    </tr>
  );
}
