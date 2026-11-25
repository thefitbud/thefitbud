import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Tabs } from "../../components/ui";

/** Type tabs and filters aligned to W-168. */
export type TemplateTypeFilter =
  | "all"
  | "workout"
  | "nutrition"
  | "onboarding"
  | "checkin"
  | "combined";

export type TemplateScope = "all" | "bases" | "mine";

export type TemplateStatusFilter = "all" | "published" | "draft" | "archived";

export type TemplateSort = "edited" | "name";

export const TYPE_FILTER_OPTIONS: {
  value: Exclude<TemplateTypeFilter, "combined">;
  label: string;
  path: string;
}[] = [
  { value: "all", label: "All", path: "/templates" },
  { value: "workout", label: "Workouts", path: "/templates/workouts" },
  { value: "nutrition", label: "Nutrition", path: "/templates/diets" },
  { value: "checkin", label: "Check-in forms", path: "/templates/checkins" },
  { value: "onboarding", label: "Intake forms", path: "/templates/onboarding" },
];

const OWNER_OPTIONS: { value: TemplateScope; label: string }[] = [
  { value: "all", label: "Anyone" },
  { value: "mine", label: "You" },
  { value: "bases", label: "FitBud base" },
];

const STATUS_OPTIONS: { value: TemplateStatusFilter; label: string }[] = [
  { value: "all", label: "Any" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

const SORT_OPTIONS: { value: TemplateSort; label: string }[] = [
  { value: "edited", label: "Last edited" },
  { value: "name", label: "Name" },
];

export function FilterChipSelect({
  label,
  value,
  defaultValue,
  options,
  onChange,
  align = "left",
  hideLabel = false,
}: {
  label: string;
  value: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  align?: "left" | "right";
  hideLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="templates-filter-dropdown" ref={rootRef}>
      <button
        type="button"
        className={
          value !== defaultValue
            ? "ui-chip templates-filter-trigger is-active"
            : "ui-chip templates-filter-trigger"
        }
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${baseId}-menu`}
        onClick={() => setOpen((current) => !current)}
      >
        {hideLabel ? null : `${label} `}
        <b>{selected?.label}</b>
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open ? (
        <ul
          id={`${baseId}-menu`}
          className={
            align === "right"
              ? "templates-filter-menu is-right"
              : "templates-filter-menu"
          }
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
  counts,
}: {
  typeFilter: TemplateTypeFilter;
  /** Rows per type tab; "all" is the total. Omitted counts render no badge. */
  counts?: Partial<Record<Exclude<TemplateTypeFilter, "combined">, number>>;
}) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const scope = readTemplateScope(params);
  const status = readTemplateStatus(params);
  const sort = readTemplateSort(params);
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

  function setSort(next: TemplateSort) {
    const copy = new URLSearchParams(params);
    if (next === "edited") copy.delete("sort");
    else copy.set("sort", next);
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

  const activeTab = typeFilter === "combined" ? "all" : typeFilter;
  const search = params.toString();

  return (
    <>
      <Tabs
        aria-label="Template types"
        value={activeTab}
        items={TYPE_FILTER_OPTIONS.map((option) => ({
          id: option.value,
          label: option.label,
          count: counts?.[option.value],
        }))}
        onChange={(id) => {
          const option = TYPE_FILTER_OPTIONS.find((o) => o.value === id);
          if (!option) return;
          navigate(search ? `${option.path}?${search}` : option.path);
        }}
      />
      <div
        className="templates-hub-toolbar"
        data-testid="templates-hub-toolbar"
      >
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
        <FilterChipSelect
          label="Owner"
          value={scope}
          defaultValue="all"
          options={OWNER_OPTIONS}
          onChange={(value) => setScope(value as TemplateScope)}
        />
        <FilterChipSelect
          label="Status"
          value={status}
          defaultValue="all"
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
        <span className="templates-sort-label">Sort</span>
        <FilterChipSelect
          label="Sort"
          hideLabel
          value={sort}
          defaultValue="edited"
          options={SORT_OPTIONS}
          onChange={(value) => setSort(value as TemplateSort)}
          align="right"
        />
      </div>
    </>
  );
}

export function readTemplateSort(params: URLSearchParams): TemplateSort {
  return params.get("sort") === "name" ? "name" : "edited";
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
