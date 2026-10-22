import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type {
  PlanContent,
  PlanTemplateSummary,
  PlanTemplateType,
} from "@fitbud/contracts";
import { blankContentForTemplateType } from "../../components/plan-composition";
import { Button } from "../../components/Button";
import { OverflowMenu } from "../../components/OverflowMenu";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
} from "../../components/StatePanels";
import { useOnline } from "../../hooks/useOnline";
import { apiClient } from "../../lib/api";
import { pageClientDirectory } from "../../lib/clients";
import { createIdempotencyKey } from "../../lib/idempotency";
import { listPlanTemplatesExtended } from "../../lib/http-api";
import { ForkTemplateModal } from "./ForkTemplateModal";
import { UseTemplateModal } from "./UseTemplateModal";
import {
  emptyMineCopy,
  errorText,
  formatUpdatedDate,
  matchesName,
  newButtonLabel,
  structureSummary,
  templateTypeLabel,
  withRelationship,
  type ApplyClient,
} from "./shared";
import {
  filterByScope,
  readTemplateScope,
  TemplateScopeToolbar,
} from "./TemplateScopeToolbar";
import { useCursorPage, useDebounced } from "./useCursorPage";

type CardMeta = {
  summary: string;
  content: PlanContent | null;
};

export function TemplatesPlanTab({
  templateType,
  hubSlug,
}: {
  templateType: PlanTemplateType;
  hubSlug: string;
}) {
  const navigate = useNavigate();
  const online = useOnline();
  const [params] = useSearchParams();
  const scope = readTemplateScope(params);
  const q = params.get("q") ?? "";
  const debouncedQ = useDebounced(q, 300);
  const plans = useCursorPage(
    `plan-templates-${templateType}-${scope}-${debouncedQ}`,
    (cursor) =>
      listPlanTemplatesExtended({
        cursor,
        limit: 50,
        templateType,
        scope: "all",
        q: debouncedQ || undefined,
      }),
  );
  const [clients, setClients] = useState<ApplyClient[]>([]);
  const [meta, setMeta] = useState<Record<string, CardMeta>>({});
  const [useTarget, setUseTarget] = useState<PlanTemplateSummary | null>(null);
  const [forkTarget, setForkTarget] = useState<PlanTemplateSummary | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<PlanTemplateSummary | null>(
    null,
  );
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void pageClientDirectory((query) => apiClient.listClients(query))
      .then((items) => {
        if (!cancelled) setClients(withRelationship(items));
      })
      .catch(() => {
        if (!cancelled) setClients([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const typed = plans.items.filter((item) => item.templateType === templateType);
  const basesCount = typed.filter((i) => i.ownership === "global").length;
  const mineCount = typed.filter((i) => i.ownership === "trainer").length;
  const scoped = filterByScope(typed, scope).filter((item) =>
    matchesName(item.title, q),
  );

  useEffect(() => {
    let cancelled = false;
    const missing = scoped
      .filter((item) => !meta[item.id])
      .slice(0, 24);
    if (missing.length === 0) return;
    void Promise.all(
      missing.map(async (item) => {
        try {
          const detail = await apiClient.getPlanTemplate(item.id);
          return [item.id, detail] as const;
        } catch {
          return [item.id, null] as const;
        }
      }),
    ).then((rows) => {
      if (cancelled) return;
      setMeta((current) => {
        const next = { ...current };
        for (const [id, detail] of rows) {
          next[id] = {
            content: detail?.content ?? null,
            summary: structureSummary(templateType, detail?.content),
          };
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [scoped, meta, templateType]);

  const kindWord = useMemo(() => {
    if (templateType === "workout") return "workout templates";
    if (templateType === "nutrition") return "diet templates";
    return "full plan templates";
  }, [templateType]);

  async function onNew() {
    setActing(true);
    setActionError(null);
    try {
      const created = await apiClient.createPlanTemplate(
        {
          title: `Untitled ${templateTypeLabel(templateType).toLowerCase()}`,
          templateType,
          content: blankContentForTemplateType(templateType),
        },
        createIdempotencyKey(),
      );
      navigate(`/templates/${hubSlug}/${created.id}`);
    } catch (err) {
      setActionError(errorText(err, "Could not create a template."));
    } finally {
      setActing(false);
    }
  }

  async function duplicate(item: PlanTemplateSummary) {
    setActing(true);
    setActionError(null);
    try {
      const detail = await apiClient.getPlanTemplate(item.id);
      const created = await apiClient.createPlanTemplate(
        {
          title: `Copy of ${detail.title}`,
          templateType: detail.templateType,
          content: detail.content,
        },
        createIdempotencyKey(),
      );
      navigate(`/templates/${hubSlug}/${created.id}`);
    } catch (err) {
      setActionError(errorText(err, "Could not duplicate this template."));
    } finally {
      setActing(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setActing(true);
    setActionError(null);
    try {
      await apiClient.deletePlanTemplate(deleteTarget.id);
      plans.setItems((current) =>
        current.filter((row) => row.id !== deleteTarget.id),
      );
      setDeleteTarget(null);
    } catch (err) {
      setActionError(errorText(err, "Could not delete this template."));
    } finally {
      setActing(false);
    }
  }

  const label = templateTypeLabel(templateType);
  const emptyMine = scope === "mine" && scoped.length === 0 && !debouncedQ;
  const emptySearch = Boolean(debouncedQ.trim()) && scoped.length === 0;

  return (
    <div className="templates-tab-panel" data-testid="screen-TW-23">
      <header className="templates-tab-header">
        <h2 className="templates-tab-title">{label} templates</h2>
        <p className="lede">Use FitBud bases, fork them, or build your own.</p>
      </header>

      {!online ? (
        <ErrorState
          kind="network"
          screenId="TW-23"
          title="You're offline"
          message="Reconnect to browse templates."
        />
      ) : null}

      <TemplateScopeToolbar
        counts={{
          all: typed.length,
          bases: basesCount,
          mine: mineCount,
        }}
        newLabel={newButtonLabel(templateType)}
        onNew={() => void onNew()}
      />

      {actionError ? (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      ) : null}

      {plans.error ? (
        <ErrorState
          message={plans.error}
          onRetry={plans.reload}
          screenId="TW-23"
        />
      ) : null}

      {plans.loading && scoped.length === 0 ? (
        <LoadingBlock label="Loading templates…" />
      ) : null}

      {!plans.loading && emptyMine ? (
        <EmptyState title={emptyMineCopy(kindWord)} />
      ) : null}

      {!plans.loading && emptySearch ? (
        <EmptyState title={`No templates match '${debouncedQ.trim()}'.`} />
      ) : null}

      {!plans.loading && !emptyMine && !emptySearch && scoped.length === 0 ? (
        <EmptyState title={`No ${kindWord} yet.`}>
          <p>Fork a FitBud base or start blank.</p>
        </EmptyState>
      ) : null}

      {scoped.length > 0 ? (
        <ul className="template-card-grid" aria-label={`${label} templates`}>
          {scoped.map((item) => {
            const isBase = item.ownership === "global";
            const summary =
              meta[item.id]?.summary ?? templateTypeLabel(templateType);
            return (
              <li key={item.id} className="template-card">
                <div className="template-card-body">
                  <p className="template-card-title">{item.title}</p>
                  <p className="template-card-meta">
                    <span
                      className={
                        isBase ? "owner-chip is-base" : "owner-chip is-mine"
                      }
                    >
                      {isBase ? "FitBud base" : "Mine"}
                    </span>
                    {isBase ? null : (
                      <span>{formatUpdatedDate(item.updatedAt)}</span>
                    )}
                  </p>
                  <p className="template-card-summary">{summary}</p>
                </div>
                <div className="template-card-actions">
                  {isBase ? (
                    <>
                      <Button
                        variant="primary"
                        onClick={() => setUseTarget(item)}
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
                        to={`/templates/${hubSlug}/${item.id}`}
                      >
                        Edit
                      </Link>
                      <OverflowMenu
                        label={`More actions for ${item.title}`}
                        items={[
                          {
                            id: "duplicate",
                            label: "Duplicate",
                            onSelect: () => void duplicate(item),
                            disabled: acting,
                          },
                          {
                            id: "delete",
                            label: "Delete",
                            destructive: true,
                            onSelect: () => setDeleteTarget(item),
                            disabled: acting,
                          },
                        ]}
                      />
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {plans.nextCursor ? (
        <Button
          variant="secondary"
          disabled={plans.loadingMore}
          onClick={plans.loadMore}
        >
          {plans.loadingMore ? "Loading…" : "Load more"}
        </Button>
      ) : null}

      {useTarget ? (
        <UseTemplateModal
          templateId={useTarget.id}
          templateTitle={useTarget.title}
          clients={clients}
          onClose={() => setUseTarget(null)}
        />
      ) : null}

      {forkTarget ? (
        <ForkTemplateModal
          templateId={forkTarget.id}
          templateTitle={forkTarget.title}
          hubSlug={hubSlug}
          onClose={() => setForkTarget(null)}
        />
      ) : null}

      {deleteTarget ? (
        <div
          className="modal-scrim"
          role="presentation"
          onClick={() => setDeleteTarget(null)}
        >
          <dialog
            open
            className="modal-card"
            aria-labelledby="delete-template-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-template-title">Delete template?</h2>
            <p>
              Delete <em>{deleteTarget.title}</em>? This can&apos;t be undone.
            </p>
            <div className="button-row">
              <Button
                variant="destructive"
                disabled={acting}
                onClick={() => void confirmDelete()}
              >
                Delete
              </Button>
              <Button
                variant="tertiary"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
            </div>
          </dialog>
        </div>
      ) : null}
    </div>
  );
}
