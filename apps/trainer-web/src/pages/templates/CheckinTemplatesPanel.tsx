import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { CheckinFormTemplateSummary } from "@fitbud/contracts";
import { Button } from "../../components/Button";
import { OverflowMenu } from "../../components/OverflowMenu";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
} from "../../components/StatePanels";
import { useOnline } from "../../hooks/useOnline";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import { ForkTemplateModal } from "./ForkTemplateModal";
import {
  emptyMineCopy,
  errorText,
  formatUpdatedDate,
  matchesName,
} from "./shared";
import {
  filterByScope,
  readTemplateScope,
  TemplateScopeToolbar,
} from "./TemplateScopeToolbar";
import { useCursorPage } from "./useCursorPage";

export function CheckinTemplatesPanel() {
  const navigate = useNavigate();
  const online = useOnline();
  const [params] = useSearchParams();
  const scope = readTemplateScope(params);
  const q = params.get("q") ?? "";
  const list = useCursorPage(`checkin-templates-${scope}-${q}`, (cursor) =>
    apiClient.listCheckinFormTemplates({ cursor, limit: 50 }),
  );
  const [forkTarget, setForkTarget] =
    useState<CheckinFormTemplateSummary | null>(null);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState<string | null>(null);

  const typed = list.items;
  const basesCount = typed.filter((i) => i.ownership === "global").length;
  const mineCount = typed.filter((i) => i.ownership === "trainer").length;
  const visible = filterByScope(typed, scope).filter((item) =>
    matchesName(item.name, q),
  );
  const emptyMine = scope === "mine" && visible.length === 0 && !q.trim();
  const emptySearch = Boolean(q.trim()) && visible.length === 0;

  async function onNew() {
    setActing(true);
    setError(null);
    try {
      const created = await apiClient.createCheckinFormTemplate(
        {
          name: "Untitled check-in form",
          fields: [
            {
              id: crypto.randomUUID(),
              type: "measurement",
              label: "Body weight",
              required: true,
              measurementType: "body_weight_kg",
            },
            {
              id: crypto.randomUUID(),
              type: "scale_1_5",
              label: "Energy",
              required: true,
              lowLabel: "Very low",
              highLabel: "Very high",
            },
          ],
        },
        createIdempotencyKey(),
      );
      navigate(`/templates/checkins/${created.id}`);
    } catch (err) {
      setError(errorText(err, "Could not create a check-in form."));
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="templates-tab-panel" data-testid="screen-TW-25-list">
      <header className="templates-tab-header">
        <h2 className="templates-tab-title">Check-in forms</h2>
        <p className="lede">
          Weekly and biweekly check-in forms. Fork a FitBud base or edit your
          own.
        </p>
      </header>

      {!online ? (
        <ErrorState
          kind="network"
          screenId="TW-25"
          title="You're offline"
          message="Reconnect to browse check-in forms."
        />
      ) : null}

      <TemplateScopeToolbar
        counts={{ all: typed.length, bases: basesCount, mine: mineCount }}
        newLabel="New check-in form"
        onNew={() => void onNew()}
        searchPlaceholder="Search forms"
      />

      {error || list.error ? (
        <ErrorState
          message={error ?? list.error ?? "Could not load forms."}
          onRetry={list.reload}
          screenId="TW-25"
        />
      ) : null}

      {list.loading && visible.length === 0 ? (
        <LoadingBlock label="Loading check-in forms…" />
      ) : null}

      {!list.loading && emptyMine ? (
        <EmptyState title={emptyMineCopy("check-in forms")} />
      ) : null}

      {!list.loading && emptySearch ? (
        <EmptyState title={`No templates match '${q.trim()}'.`} />
      ) : null}

      {visible.length > 0 ? (
        <ul className="template-card-grid" aria-label="Check-in forms">
          {visible.map((item) => {
            const isBase = item.ownership === "global";
            return (
              <li key={item.id} className="template-card">
                <div className="template-card-body">
                  <p className="template-card-title">{item.name}</p>
                  <p className="template-card-meta">
                    <span
                      className={
                        isBase ? "owner-chip is-base" : "owner-chip is-mine"
                      }
                    >
                      {isBase ? "FitBud base" : "Mine"}
                    </span>
                    <span>{formatUpdatedDate(item.updatedAt)}</span>
                  </p>
                  <p className="template-card-summary">
                    v{item.latestVersionNumber} · check-in form
                  </p>
                </div>
                <div className="template-card-actions">
                  {isBase ? (
                    <>
                      <Button
                        variant="primary"
                        onClick={() => setForkTarget(item)}
                      >
                        Use
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setForkTarget(item)}
                      >
                        Fork to edit
                      </Button>
                    </>
                  ) : (
                    <>
                      <Link
                        className="button-primary"
                        to={`/templates/checkins/${item.id}`}
                      >
                        Edit
                      </Link>
                      <OverflowMenu
                        label={`More actions for ${item.name}`}
                        items={[
                          {
                            id: "delete",
                            label: "Delete",
                            destructive: true,
                            onSelect: () =>
                              setDeleteBlocked(
                                "Forms in use can't be deleted",
                              ),
                          },
                        ]}
                      />
                    </>
                  )}
                </div>
                {deleteBlocked && !isBase ? (
                  <p className="muted" role="status">
                    {deleteBlocked}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {acting ? <p className="muted">Creating…</p> : null}

      {forkTarget ? (
        <ForkTemplateModal
          templateId={forkTarget.id}
          templateTitle={forkTarget.name}
          hubSlug="checkins"
          kind="checkin"
          onClose={() => setForkTarget(null)}
        />
      ) : null}
    </div>
  );
}
