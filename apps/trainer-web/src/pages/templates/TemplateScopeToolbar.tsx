import { useSearchParams } from "react-router-dom";

export type TemplateScope = "all" | "bases" | "mine";

export function TemplateScopeToolbar({
  counts,
  newLabel,
  onNew,
  searchPlaceholder = "Search templates",
}: {
  counts?: { all: number; bases: number; mine: number };
  newLabel?: string;
  onNew?: () => void;
  searchPlaceholder?: string;
}) {
  const [params, setParams] = useSearchParams();
  const scope = (params.get("scope") as TemplateScope) || "all";
  const q = params.get("q") ?? "";

  function setScope(next: TemplateScope) {
    const copy = new URLSearchParams(params);
    if (next === "all") copy.delete("scope");
    else copy.set("scope", next);
    setParams(copy, { replace: true });
  }

  function setQuery(value: string) {
    const copy = new URLSearchParams(params);
    if (value.trim()) copy.set("q", value);
    else copy.delete("q");
    setParams(copy, { replace: true });
  }

  return (
    <div className="templates-scope-toolbar">
      <div className="segment" role="group" aria-label="Template scope">
        {(
          [
            ["all", "All", counts?.all],
            ["bases", "FitBud bases", counts?.bases],
            ["mine", "Mine", counts?.mine],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            className={scope === value ? "segment-btn is-on" : "segment-btn"}
            aria-pressed={scope === value}
            onClick={() => setScope(value)}
          >
            {label}
            {typeof count === "number" ? (
              <span className="scope-count">{count}</span>
            ) : null}
          </button>
        ))}
      </div>
      <label className="templates-search field">
        <span className="sr-only">Search templates</span>
        <input
          type="search"
          placeholder={searchPlaceholder}
          value={q}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {newLabel && onNew ? (
        <button type="button" className="button-primary" onClick={onNew}>
          {newLabel}
        </button>
      ) : null}
    </div>
  );
}

export function readTemplateScope(params: URLSearchParams): TemplateScope {
  const raw = params.get("scope");
  if (raw === "bases" || raw === "mine") return raw;
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
