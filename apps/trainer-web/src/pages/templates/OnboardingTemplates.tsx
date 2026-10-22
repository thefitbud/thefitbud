import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { OnboardingFormTemplateSummary } from "@fitbud/contracts";
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

export function OnboardingTemplates() {
  const navigate = useNavigate();
  const online = useOnline();
  const [params] = useSearchParams();
  const scope = readTemplateScope(params);
  const q = params.get("q") ?? "";
  const list = useCursorPage(`onboarding-templates-${scope}-${q}`, (cursor) =>
    apiClient.listOnboardingFormTemplates({ cursor, limit: 50 }),
  );
  const [forkTarget, setForkTarget] =
    useState<OnboardingFormTemplateSummary | null>(null);
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
      const created = await apiClient.createOnboardingFormTemplate(
        {
          name: "Untitled onboarding form",
          fields: [
            {
              id: crypto.randomUUID(),
              type: "short_text",
              label: "What is your main goal?",
              required: true,
            },
          ],
        },
        createIdempotencyKey(),
      );
      navigate(`/templates/onboarding/${created.id}`);
    } catch (err) {
      setError(errorText(err, "Could not create an onboarding form."));
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="templates-tab-panel" data-testid="screen-TW-24-list">
      <header className="templates-tab-header">
        <h2 className="templates-tab-title">Onboarding forms</h2>
        <p className="lede">Intake forms for new clients.</p>
      </header>

      {!online ? (
        <ErrorState
          kind="network"
          screenId="TW-24"
          title="You're offline"
          message="Reconnect to browse onboarding forms."
        />
      ) : null}

      <TemplateScopeToolbar
        counts={{ all: typed.length, bases: basesCount, mine: mineCount }}
        newLabel="New onboarding form"
        onNew={() => void onNew()}
        searchPlaceholder="Search forms"
      />

      {error || list.error ? (
        <ErrorState
          message={error ?? list.error ?? "Could not load forms."}
          onRetry={list.reload}
          screenId="TW-24"
        />
      ) : null}

      {list.loading && visible.length === 0 ? (
        <LoadingBlock label="Loading onboarding forms…" />
      ) : null}

      {!list.loading && emptyMine ? (
        <EmptyState title={emptyMineCopy("onboarding forms")} />
      ) : null}

      {!list.loading && emptySearch ? (
        <EmptyState title={`No templates match '${q.trim()}'.`} />
      ) : null}

      {visible.length > 0 ? (
        <ul className="template-card-grid" aria-label="Onboarding forms">
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
                    v{item.latestVersionNumber} · intake form
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
                        to={`/templates/onboarding/${item.id}`}
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
          hubSlug="onboarding"
          kind="onboarding"
          onClose={() => setForkTarget(null)}
        />
      ) : null}
    </div>
  );
}
