import { useState } from "react";
import { Link } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import type { CheckinFormTemplateSummary } from "@fitbud/contracts";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import { errorText, formatUpdated, matchesName } from "./shared";
import { useCursorPage } from "./useCursorPage";
import {
  filterByScope,
  readTemplateScope,
  TemplateScopeToolbar,
} from "./TemplateScopeToolbar";

export function CheckinTemplatesPanel() {
  const [params] = useSearchParams();
  const scope = readTemplateScope(params);
  const q = params.get("q") ?? "";
  const list = useCursorPage(`checkin-templates-${scope}-${q}`, (cursor) =>
    apiClient.listCheckinFormTemplates({ cursor, limit: 50 }),
  );
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = filterByScope(list.items, scope).filter((item) =>
    matchesName(item.name, q),
  );

  async function forkBase(template: CheckinFormTemplateSummary) {
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const detail = await apiClient.forkCheckinFormTemplate(
        template.id,
        { name: `${template.name} (mine)` },
        createIdempotencyKey(),
      );
      list.setItems((current) => [
        {
          id: detail.id,
          ownership: detail.ownership,
          trainerUserId: detail.trainerUserId,
          name: detail.name,
          description: detail.description,
          latestVersionId: detail.latestVersionId,
          latestVersionNumber: detail.latestVersionNumber,
          createdAt: detail.createdAt,
          updatedAt: detail.updatedAt,
        },
        ...current,
      ]);
      setMessage("Forked into your templates.");
    } catch (err) {
      setError(errorText(err, "Could not fork template."));
    } finally {
      setActing(false);
    }
  }

  return (
    <section className="page templates-page" data-testid="screen-TW-25">
      <header className="page-header">
        <h1>Check-in forms</h1>
        <p className="lede">
          Weekly and biweekly check-in forms. Fork a FitBud base or edit your own.
        </p>
      </header>
      <TemplateScopeToolbar />
      {message ? <p className="form-success" role="status">{message}</p> : null}
      {error || list.error ? (
        <p className="form-error" role="alert">
          {error ?? list.error}{" "}
          <button type="button" className="button-link" onClick={list.reload}>
            Retry
          </button>
        </p>
      ) : null}
      {list.loading ? <p className="muted">Loading check-in templates…</p> : null}
      <ul className="template-list">
        {visible.map((item) => (
          <li key={item.id} className="template-row">
            <div>
              <p className="template-title">{item.name}</p>
              <p className="muted">
                {item.ownership === "global" ? "FitBud base" : "Mine"} · v
                {item.latestVersionNumber} · {formatUpdated(item.updatedAt)}
              </p>
            </div>
            <div className="button-row">
              <Link
                className="button-secondary"
                to={`/templates/checkins/${item.id}`}
              >
                Open
              </Link>
              {item.ownership === "global" ? (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={acting}
                  onClick={() => void forkBase(item)}
                >
                  Fork
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {list.nextCursor ? (
        <button
          type="button"
          className="button-secondary"
          disabled={list.loadingMore}
          onClick={list.loadMore}
        >
          {list.loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </section>
  );
}
