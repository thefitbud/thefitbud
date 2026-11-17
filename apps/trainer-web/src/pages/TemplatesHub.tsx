import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ClipboardList,
  Dumbbell,
  FilePlus2,
  Pencil,
  Plus,
  UtensilsCrossed,
  User,
} from "lucide-react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import type {
  CheckinFormTemplateSummary,
  OnboardingFormTemplateSummary,
  PlanTemplateSummary,
  PlanTemplateType,
} from "@fitbud/contracts";
import { labelFor } from "@fitbud/core";
import { blankContentForTemplateType } from "../components/plan-composition";
import { Button } from "../components/Button";
import { OverflowMenu } from "../components/OverflowMenu";
import {
  ErrorState,
  LoadingBlock,
} from "../components/StatePanels";
import { useOnline } from "../hooks/useOnline";
import { apiClient } from "../lib/api";
import { pageClientDirectory } from "../lib/clients";
import { createIdempotencyKey } from "../lib/idempotency";
import { listPlanTemplatesExtended } from "../lib/http-api";
import { CheckinTemplateBuilderPage } from "./templates/CheckinTemplateBuilderPage";
import { ForkTemplateModal } from "./templates/ForkTemplateModal";
import { LibrariesPanel } from "./templates/LibrariesPanel";
import { OnboardingTemplateBuilderPage } from "./templates/OnboardingTemplateBuilderPage";
import { PlanTemplateEditorPage } from "./templates/PlanTemplateEditorPage";
import { UseCheckinFormModal } from "./templates/UseCheckinFormModal";
import { UseTemplateModal } from "./templates/UseTemplateModal";
import {
  emptyMineBody,
  emptyMineTitle,
  errorText,
  hubRowSubtitle,
  matchesName,
  structureSummary,
  withRelationship,
  type ApplyClient,
} from "./templates/shared";
import {
  filterByScope,
  readTemplateScope,
  readTemplateStatus,
  TemplateScopeToolbar,
  typeFilterFromRoute,
  type TemplateTypeFilter,
} from "./templates/TemplateScopeToolbar";
import { useCursorPage, useDebounced } from "./templates/useCursorPage";
import "./TemplatesHub.css";

const LEGACY_FAMILY: Record<string, string> = {
  workout: "workouts",
  nutrition: "diets",
  combined: "full-plans",
};

type HubKind = "workout" | "nutrition" | "combined" | "onboarding" | "checkin";

type HubRow = {
  id: string;
  kind: HubKind;
  title: string;
  ownership: "global" | "trainer";
  subtitle: string;
  hubSlug: string;
  plan?: PlanTemplateSummary;
  onboarding?: OnboardingFormTemplateSummary;
  checkin?: CheckinFormTemplateSummary;
};

export function TemplatesHub() {
  return (
    <Routes>
      <Route index element={<TemplatesHubChrome />} />
      <Route
        path="onboarding/:templateId"
        element={<OnboardingTemplateBuilderPage />}
      />
      <Route
        path="checkins/:templateId"
        element={<CheckinTemplateBuilderPage />}
      />
      <Route path="workouts/:templateId" element={<PlanTemplateEditorPage />} />
      <Route path="diets/:templateId" element={<PlanTemplateEditorPage />} />
      <Route
        path="full-plans/:templateId"
        element={<PlanTemplateEditorPage />}
      />
      <Route path="libraries/:segment" element={<TemplatesHubChrome />} />
      <Route path=":type" element={<TemplatesHubChrome />} />
    </Routes>
  );
}

function TemplatesHubChrome() {
  const { type, segment } = useParams();
  const resolvedType = type === "libraries" || segment ? "libraries" : type;
  if (
    resolvedType &&
    LEGACY_FAMILY[resolvedType] &&
    LEGACY_FAMILY[resolvedType] !== resolvedType
  ) {
    return (
      <Navigate to={`/templates/${LEGACY_FAMILY[resolvedType]}`} replace />
    );
  }

  if (resolvedType === "libraries") {
    return (
      <section
        className="page templates-hub templates-hub-v3 templates-hub-libraries-chrome"
        data-testid="screen-TW-23-hub"
      >
        <header className="templates-hub-header">
          <div className="page-header">
            <h1>Templates</h1>
            <p className="lede">Plans and forms you can reuse for any client</p>
          </div>
        </header>
        <nav className="templates-hub-toolbar" aria-label="Libraries navigation">
          <Link className="templates-libraries-link" to="/templates">
            ← Templates
          </Link>
        </nav>
        <LibrariesPanel />
      </section>
    );
  }

  return <TemplatesHubList routeType={resolvedType} />;
}

function TemplatesHubList({ routeType }: { routeType: string | undefined }) {
  const navigate = useNavigate();
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const typeFilter = typeFilterFromRoute(routeType);
  const scope = readTemplateScope(params);
  const status = readTemplateStatus(params);
  const q = params.get("q") ?? "";
  const debouncedQ = useDebounced(q, 300);

  const workouts = useCursorPage(`hub-workouts-${debouncedQ}`, (cursor) =>
    listPlanTemplatesExtended({
      cursor,
      limit: 50,
      templateType: "workout",
      scope: "all",
      q: debouncedQ || undefined,
    }),
  );
  const diets = useCursorPage(`hub-diets-${debouncedQ}`, (cursor) =>
    listPlanTemplatesExtended({
      cursor,
      limit: 50,
      templateType: "nutrition",
      scope: "all",
      q: debouncedQ || undefined,
    }),
  );
  const fullPlans = useCursorPage(`hub-full-${debouncedQ}`, (cursor) =>
    listPlanTemplatesExtended({
      cursor,
      limit: 50,
      templateType: "combined",
      scope: "all",
      q: debouncedQ || undefined,
    }),
  );
  const onboarding = useCursorPage(`hub-onboarding-${debouncedQ}`, (cursor) =>
    apiClient.listOnboardingFormTemplates({ cursor, limit: 50 }),
  );
  const checkins = useCursorPage(`hub-checkins-${debouncedQ}`, (cursor) =>
    apiClient.listCheckinFormTemplates({ cursor, limit: 50 }),
  );

  const [clients, setClients] = useState<ApplyClient[]>([]);
  const [planMeta, setPlanMeta] = useState<Record<string, { summary: string }>>(
    {},
  );
  const [usePlan, setUsePlan] = useState<PlanTemplateSummary | null>(null);
  const [useCheckin, setUseCheckin] =
    useState<CheckinFormTemplateSummary | null>(null);
  const [forkTarget, setForkTarget] = useState<{
    id: string;
    title: string;
    hubSlug: string;
    kind: "plan" | "onboarding" | "checkin";
  } | null>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!newOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!newMenuRef.current?.contains(event.target as Node)) {
        setNewOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [newOpen]);

  const loading =
    workouts.loading ||
    diets.loading ||
    fullPlans.loading ||
    onboarding.loading ||
    checkins.loading;
  const listError =
    workouts.error ||
    diets.error ||
    fullPlans.error ||
    onboarding.error ||
    checkins.error;

  const rows = useMemo(() => {
    const next: HubRow[] = [];

    const pushPlan = (item: PlanTemplateSummary) => {
      const kind = item.templateType as HubKind;
      const hubSlug =
        kind === "nutrition"
          ? "diets"
          : kind === "combined"
            ? "full-plans"
            : "workouts";
      const detail =
        planMeta[item.id]?.summary ??
        structureSummary(item.templateType, null);
      next.push({
        id: item.id,
        kind,
        title: item.title,
        ownership: item.ownership,
        subtitle: hubRowSubtitle(kind, detail, item.recordVersion || undefined),
        hubSlug,
        plan: item,
      });
    };

    for (const item of workouts.items) {
      if (item.templateType === "workout") pushPlan(item);
    }
    for (const item of diets.items) {
      if (item.templateType === "nutrition") pushPlan(item);
    }
    for (const item of fullPlans.items) {
      if (item.templateType === "combined") pushPlan(item);
    }
    for (const item of onboarding.items) {
      next.push({
        id: item.id,
        kind: "onboarding",
        title: item.name,
        ownership: item.ownership,
        subtitle: hubRowSubtitle(
          "onboarding",
          "intake form",
          item.latestVersionNumber,
        ),
        hubSlug: "onboarding",
        onboarding: item,
      });
    }
    for (const item of checkins.items) {
      next.push({
        id: item.id,
        kind: "checkin",
        title: item.name,
        ownership: item.ownership,
        subtitle: hubRowSubtitle(
          "checkin",
          "check-in form",
          item.latestVersionNumber,
        ),
        hubSlug: "checkins",
        checkin: item,
      });
    }

    return next;
  }, [
    workouts.items,
    diets.items,
    fullPlans.items,
    onboarding.items,
    checkins.items,
    planMeta,
  ]);

  const typedRows = useMemo(() => {
    if (typeFilter === "all") return rows;
    if (typeFilter === "combined") {
      return rows.filter((row) => row.kind === "combined");
    }
    return rows.filter((row) => row.kind === typeFilter);
  }, [rows, typeFilter]);

  const scoped = useMemo(() => {
    let list = filterByScope(typedRows, scope).filter((row) =>
      matchesName(row.title, q),
    );
    // API has no draft/archived template status (D-W12b-1 follow-up).
    // Every listed template is treated as published for filter/display.
    if (status === "draft" || status === "archived") list = [];
    return list;
  }, [typedRows, scope, q, status]);

  useEffect(() => {
    let cancelled = false;
    const missing = scoped
      .filter((row) => row.plan && !planMeta[row.id])
      .slice(0, 24);
    if (missing.length === 0) return;
    void Promise.all(
      missing.map(async (row) => {
        try {
          const detail = await apiClient.getPlanTemplate(row.id);
          return [
            row.id,
            structureSummary(row.plan!.templateType, detail?.content),
          ] as const;
        } catch {
          return [
            row.id,
            structureSummary(row.plan!.templateType, null),
          ] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setPlanMeta((current) => {
        const next = { ...current };
        for (const [id, summary] of entries) {
          next[id] = { summary };
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [scoped, planMeta]);

  const emptyMine =
    scope === "mine" &&
    scoped.length === 0 &&
    !debouncedQ.trim() &&
    (status === "all" || status === "published") &&
    !loading;
  const emptySearch =
    Boolean(debouncedQ.trim()) && scoped.length === 0 && !loading;
  const emptyStatus =
    (status === "draft" || status === "archived") &&
    scoped.length === 0 &&
    !loading;
  const emptyOther =
    !loading &&
    !emptyMine &&
    !emptySearch &&
    !emptyStatus &&
    scoped.length === 0;

  async function createPlan(templateType: PlanTemplateType) {
    setActing(true);
    setActionError(null);
    setNewOpen(false);
    try {
      const created = await apiClient.createPlanTemplate(
        {
          title: `Untitled ${labelFor("plan_template_type", templateType).toLowerCase()}`,
          templateType,
          content: blankContentForTemplateType(templateType),
        },
        createIdempotencyKey(),
      );
      const slug =
        templateType === "nutrition"
          ? "diets"
          : templateType === "combined"
            ? "full-plans"
            : "workouts";
      navigate(`/templates/${slug}/${created.id}`);
    } catch (err) {
      setActionError(errorText(err, "Could not create a template."));
    } finally {
      setActing(false);
    }
  }

  async function createOnboarding() {
    setActing(true);
    setActionError(null);
    setNewOpen(false);
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
      setActionError(errorText(err, "Could not create an onboarding form."));
    } finally {
      setActing(false);
    }
  }

  async function createCheckin() {
    setActing(true);
    setActionError(null);
    setNewOpen(false);
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
      setActionError(errorText(err, "Could not create a check-in form."));
    } finally {
      setActing(false);
    }
  }

  function onNewPrimary() {
    if (typeFilter === "workout") void createPlan("workout");
    else if (typeFilter === "nutrition") void createPlan("nutrition");
    else if (typeFilter === "combined") void createPlan("combined");
    else if (typeFilter === "onboarding") void createOnboarding();
    else if (typeFilter === "checkin") void createCheckin();
    else setNewOpen((open) => !open);
  }

  function showFitBudBase() {
    const copy = new URLSearchParams(params);
    copy.set("scope", "bases");
    copy.delete("status");
    setParams(copy, { replace: true });
  }

  function clearFilters() {
    const copy = new URLSearchParams(params);
    copy.delete("scope");
    copy.delete("status");
    copy.delete("q");
    setParams(copy, { replace: true });
  }

  function onUse(row: HubRow) {
    if (row.plan) {
      setUsePlan(row.plan);
      return;
    }
    if (row.checkin) {
      setUseCheckin(row.checkin);
      return;
    }
    if (row.onboarding) {
      setForkTarget({
        id: row.id,
        title: row.title,
        hubSlug: "onboarding",
        kind: "onboarding",
      });
    }
  }

  function onFork(row: HubRow) {
    const kind =
      row.kind === "onboarding"
        ? "onboarding"
        : row.kind === "checkin"
          ? "checkin"
          : "plan";
    setForkTarget({
      id: row.id,
      title: row.title,
      hubSlug: row.hubSlug,
      kind,
    });
  }

  return (
    <section
      className="page templates-hub templates-hub-v3"
      data-testid="screen-TW-23-hub"
    >
      <header className="templates-hub-header">
        <div className="page-header">
          <h1>Templates</h1>
          <p className="lede">Plans and forms you can reuse for any client</p>
        </div>
        <div className="templates-hub-new" ref={newMenuRef}>
          <Button
            variant="primary"
            className="templates-hub-new-btn"
            disabled={acting}
            onClick={onNewPrimary}
            aria-haspopup={typeFilter === "all" ? "menu" : undefined}
            aria-expanded={typeFilter === "all" ? newOpen : undefined}
          >
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            New template
          </Button>
          {newOpen && typeFilter === "all" ? (
            <ul className="templates-hub-new-menu" role="menu">
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void createPlan("workout")}
                >
                  Workout
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void createPlan("nutrition")}
                >
                  Nutrition
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void createOnboarding()}
                >
                  Intake form
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void createCheckin()}
                >
                  Check-in form
                </button>
              </li>
            </ul>
          ) : null}
        </div>
      </header>

      {!online ? (
        <ErrorState
          kind="network"
          screenId="TW-23"
          title="You're offline"
          message="Reconnect to browse templates."
        />
      ) : null}

      <TemplateScopeToolbar typeFilter={typeFilter} />

      {actionError ? (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      ) : null}

      {listError ? (
        <ErrorState
          message={listError}
          onRetry={() => {
            workouts.reload();
            diets.reload();
            fullPlans.reload();
            onboarding.reload();
            checkins.reload();
          }}
          screenId="TW-23"
        />
      ) : null}

      <div data-testid="screen-TW-23">
        {loading && scoped.length === 0 ? (
          <LoadingBlock label="Loading templates…" />
        ) : null}

        {emptyMine ? (
          <div
            className="templates-hub-empty"
            data-testid="templates-mine-empty"
          >
            <div className="templates-hub-empty-icon" aria-hidden="true">
              <FilePlus2 size={22} strokeWidth={1.75} />
            </div>
            <h2>{emptyMineTitle(typeFilter)}</h2>
            <p>{emptyMineBody(typeFilter)}</p>
            <div className="templates-hub-empty-actions">
              <Button variant="primary" onClick={showFitBudBase}>
                Show FitBud base
              </Button>
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </div>
        ) : null}

        {emptySearch ? (
          <div className="templates-hub-empty">
            <h2>No templates match &lsquo;{debouncedQ.trim()}&rsquo;</h2>
            <p>Try another search, or clear filters.</p>
            <div className="templates-hub-empty-actions">
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </div>
        ) : null}

        {emptyStatus ? (
          <div className="templates-hub-empty">
            <h2>
              No {status === "draft" ? "draft" : "archived"} templates
            </h2>
            <p>Clear the status filter to see your templates.</p>
            <div className="templates-hub-empty-actions">
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </div>
        ) : null}

        {emptyOther ? (
          <div className="templates-hub-empty">
            <h2>No templates yet</h2>
            <p>Fork a FitBud base or start blank.</p>
            <div className="templates-hub-empty-actions">
              <Button variant="primary" onClick={onNewPrimary}>
                New template
              </Button>
            </div>
          </div>
        ) : null}

        {scoped.length > 0 ? (
          <div className="templates-hub-table-wrap">
            <table className="templates-hub-table">
              <thead>
                <tr>
                  <th scope="col">Template</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Status</th>
                  <th scope="col">Used by</th>
                  <th scope="col" className="col-use">
                    <span className="sr-only">Use</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {scoped.map((row) => (
                  <HubTableRow
                    key={`${row.kind}-${row.id}`}
                    row={row}
                    onUse={() => onUse(row)}
                    onFork={() => onFork(row)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {usePlan ? (
        <UseTemplateModal
          templateId={usePlan.id}
          templateTitle={usePlan.title}
          clients={clients}
          onClose={() => setUsePlan(null)}
        />
      ) : null}

      {useCheckin ? (
        <UseCheckinFormModal
          formVersionId={useCheckin.latestVersionId}
          formTitle={useCheckin.name}
          clients={clients}
          onClose={() => setUseCheckin(null)}
        />
      ) : null}

      {forkTarget ? (
        <ForkTemplateModal
          templateId={forkTarget.id}
          templateTitle={forkTarget.title}
          hubSlug={forkTarget.hubSlug}
          kind={forkTarget.kind}
          onClose={() => setForkTarget(null)}
        />
      ) : null}
    </section>
  );
}

function HubTableRow({
  row,
  onUse,
  onFork,
}: {
  row: HubRow;
  onUse: () => void;
  onFork: () => void;
}) {
  const isBase = row.ownership === "global";
  const editPath = `/templates/${row.hubSlug}/${row.id}`;

  return (
    <tr>
      <td>
        <div className="templates-hub-row-main">
          <span
            className="templates-hub-type-icon"
            data-kind={row.kind}
            aria-hidden="true"
          >
            <TypeIcon kind={row.kind} />
          </span>
          <div className="templates-hub-row-copy">
            <p className="templates-hub-row-title">
              {isBase ? (
                row.title
              ) : (
                <Link to={editPath}>{row.title}</Link>
              )}
            </p>
            <p className="templates-hub-row-meta">{row.subtitle}</p>
          </div>
        </div>
      </td>
      <td>
        <span
          className={
            isBase ? "templates-hub-chip is-base" : "templates-hub-chip is-mine"
          }
        >
          {isBase ? (
            <Check size={12} strokeWidth={2.5} aria-hidden="true" />
          ) : (
            <User size={12} strokeWidth={2.5} aria-hidden="true" />
          )}
          {isBase ? "FitBud base" : "Mine"}
        </span>
      </td>
      <td>
        <span className="templates-hub-chip is-published">
          <Check size={12} strokeWidth={2.5} aria-hidden="true" />
          {labelFor("plan_version_status", "published")}
        </span>
      </td>
      <td>
        <span className="templates-hub-used-by">—</span>
      </td>
      <td className="col-use">
        <div className="templates-hub-row-actions">
          <button
            type="button"
            className="templates-hub-use-btn"
            onClick={onUse}
          >
            Use
          </button>
          {isBase ? (
            <OverflowMenu
              label={`More actions for ${row.title}`}
              items={[
                {
                  id: "fork",
                  label: "Make your own copy",
                  onSelect: onFork,
                },
              ]}
            />
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function TypeIcon({ kind }: { kind: HubKind }) {
  if (kind === "nutrition") {
    return <UtensilsCrossed size={16} strokeWidth={1.75} />;
  }
  if (kind === "onboarding" || kind === "checkin") {
    return <ClipboardList size={16} strokeWidth={1.75} />;
  }
  if (kind === "combined") {
    return <Pencil size={16} strokeWidth={1.75} />;
  }
  return <Dumbbell size={16} strokeWidth={1.75} />;
}

export type { TemplateTypeFilter };
