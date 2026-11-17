import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

/** Type filter aligned to locked frames 168/169 (not the old six tabs). */
export type TemplateTypeFilter =
  | "all"
  | "workout"
  | "nutrition"
  | "onboarding"
  | "checkin"
  | "combined";

export type TemplateScope = "all" | "bases" | "mine";

export type TemplateStatusFilter = "all" | "published" | "draft" | "archived";

export const TYPE_FILTER_OPTIONS: {
  value: Exclude<TemplateTypeFilter, "combined">;
  label: string;
  path: string;
}[] = [
  { value: "all", label: "All", path: "/templates" },
  { value: "workout", label: "Workout", path: "/templates/workouts" },
  { value: "nutrition", label: "Nutrition", path: "/templates/diets" },
  {
    value: "onboarding",
    label: "Intake form",
    path: "/templates/onboarding",
  },
  { value: "checkin", label: "Check-in form", path: "/templates/checkins" },
];

const OWNER_OPTIONS: { value: TemplateScope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
  { value: "bases", label: "FitBud base" },
];

const STATUS_OPTIONS: { value: TemplateStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

function SingleSelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const selected = options.find((option) => option.value === value);
  const summary =
    value === "all" || !selected ? label : `${label}: ${selected.label}`;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div className="templates-filter-dropdown" ref={rootRef}>
      <button
        type="button"
        className={
          value !== "all"
            ? "templates-filter-trigger has-selection"
            : "templates-filter-trigger"
        }
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${baseId}-menu`}
        onClick={() => setOpen((current) => !current)}
      >
        {summary}
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open ? (
        <ul
          id={`${baseId}-menu`}
          className="templates-filter-menu"
          role="listbox"
          aria-label={label}
        >
          {options.map((option) => (
            <li key={option.value} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={value === option.value}
                className={value === option.value ? "is-on" : undefined}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
                {value === option.value ? (
                  <Check size={16} strokeWidth={2} aria-hidden="true" />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function TemplateScopeToolbar({
  typeFilter,
  showLibrariesLink = true,
}: {
  typeFilter: TemplateTypeFilter;
  showLibrariesLink?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const scope = readTemplateScope(params);
  const status = readTemplateStatus(params);
  const q = params.get("q") ?? "";
  const showClear = scope !== "all" || status !== "all" || Boolean(q.trim());

  function setScope(next: TemplateScope) {
    const copy = new URLSearchParams(params);
    if (next === "all") copy.delete("scope");
    else copy.set("scope", next);
    setParams(copy, { replace: true });
  }

  function setStatus(next: TemplateStatusFilter) {
    const copy = new URLSearchParams(params);
    if (next === "all") copy.delete("status");
    else copy.set("status", next);
    setParams(copy, { replace: true });
  }

  function setQuery(value: string) {
    const copy = new URLSearchParams(params);
    if (value.trim()) copy.set("q", value);
    else copy.delete("q");
    setParams(copy, { replace: true });
  }

  function clearFilters() {
    const copy = new URLSearchParams(params);
    copy.delete("scope");
    copy.delete("status");
    copy.delete("q");
    setParams(copy, { replace: true });
  }

  return (
    <div className="templates-hub-toolbar" data-testid="templates-hub-toolbar">
      <label className="templates-hub-search">
        <Search size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className="sr-only">Search templates</span>
        <input
          type="search"
          placeholder="Search templates"
          value={q}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <div
        className="templates-type-segment"
        role="group"
        aria-label="Template types"
      >
        {TYPE_FILTER_OPTIONS.map((option) => {
          const active =
            typeFilter === option.value ||
            (option.value === "all" && typeFilter === "combined");
          const search = params.toString();
          const to = search ? `${option.path}?${search}` : option.path;
          return (
            <Link
              key={option.value}
              to={to}
              className={active ? "is-on" : undefined}
              aria-current={active ? "page" : undefined}
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      <SingleSelectFilter
        label="Owner"
        value={scope}
        options={OWNER_OPTIONS}
        onChange={(value) => setScope(value as TemplateScope)}
      />
      <SingleSelectFilter
        label="Status"
        value={status}
        options={STATUS_OPTIONS}
        onChange={(value) => setStatus(value as TemplateStatusFilter)}
      />

      {showClear ? (
        <button
          type="button"
          className="templates-filter-clear"
          onClick={clearFilters}
        >
          Clear filters
        </button>
      ) : null}

      {showLibrariesLink ? (
        <Link className="templates-libraries-link" to="/templates/libraries/exercises">
          Libraries
        </Link>
      ) : null}
    </div>
  );
}

export function readTemplateScope(params: URLSearchParams): TemplateScope {
  const raw = params.get("scope");
  if (raw === "bases" || raw === "mine") return raw;
  return "all";
}

export function readTemplateStatus(
  params: URLSearchParams,
): TemplateStatusFilter {
  const raw = params.get("status");
  if (raw === "published" || raw === "draft" || raw === "archived") return raw;
  return "all";
}

export function filterByScope<T extends { ownership: "global" | "trainer" }>(
  items: T[],
  scope: TemplateScope,
): T[] {
  if (scope === "bases")
    return items.filter((item) => item.ownership === "global");
  if (scope === "mine")
    return items.filter((item) => item.ownership === "trainer");
  return items;
}

export function typeFilterFromRoute(
  type: string | undefined,
): TemplateTypeFilter {
  if (type === "workouts" || type === "workout") return "workout";
  if (type === "diets" || type === "nutrition") return "nutrition";
  if (type === "full-plans" || type === "combined") return "combined";
  if (type === "checkins" || type === "checkin") return "checkin";
  if (type === "onboarding") return "onboarding";
  return "all";
}

export function hubPathForType(filter: TemplateTypeFilter): string {
  switch (filter) {
    case "workout":
      return "/templates/workouts";
    case "nutrition":
      return "/templates/diets";
    case "combined":
      return "/templates/full-plans";
    case "checkin":
      return "/templates/checkins";
    case "onboarding":
      return "/templates/onboarding";
    default:
      return "/templates";
  }
}
