import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import { StatusBadge } from "../components/StatusBadge";
import { apiClient } from "../lib/api";
import {
  buildClientDirectoryRows,
  primaryActionForStatus,
  type ClientDirectoryRow,
} from "../lib/clients";

export function ClientsPage() {
  const [rows, setRows] = useState<ClientDirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invitations, relationships] = await Promise.all([
        apiClient.listInvitations(),
        apiClient.listRelationships(),
      ]);
      setRows(
        buildClientDirectoryRows({
          invitations: invitations.items,
          relationships: relationships.items,
        }),
      );
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load clients.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Clients</h1>
          <p className="lede">Find clients and open the next useful action.</p>
        </div>
        <Link to="/clients/add" className="button-primary">
          Add Client
        </Link>
      </header>

      {error ? (
        <p className="form-error" role="alert">
          {error}{" "}
          <button type="button" className="button-link" onClick={() => void load()}>
            Retry
          </button>
        </p>
      ) : null}

      {loading ? (
        <p className="muted" aria-busy="true">
          Loading clients…
        </p>
      ) : rows.length === 0 ? (
        <div className="empty-state" role="status">
          <h2>No clients yet</h2>
          <p>Invite a trainee to start onboarding.</p>
          <Link to="/clients/add" className="button-primary">
            Add Client
          </Link>
        </div>
      ) : (
        <ul className="client-list" aria-label="Clients">
          {rows.map((row) => (
            <ClientRow key={row.key} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ClientRow({ row }: { row: ClientDirectoryRow }) {
  const action = primaryActionForStatus(row.onboardingStatus);
  const href =
    action.href && row.relationshipId
      ? `/clients/${row.relationshipId}/${action.href}`
      : null;

  return (
    <li className="client-row">
      <div className="client-row-main">
        <div>
          <p className="client-name">{row.name}</p>
          <p className="client-subtitle">{row.subtitle}</p>
        </div>
        <StatusBadge status={row.onboardingStatus} />
      </div>
      <div className="client-row-action">
        {href ? (
          <Link
            to={href}
            className="button-secondary"
            aria-label={`${action.label} for ${row.name}`}
          >
            {action.label}
          </Link>
        ) : (
          <span className="muted-action">{action.label}</span>
        )}
      </div>
    </li>
  );
}
