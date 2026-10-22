import { useEffect, useState, type ReactNode } from "react";
import { Search } from "lucide-react";

export type FilterPillOption = {
  value: string;
  label: string;
  count?: number;
};

type MultiPillProps = {
  label: string;
  options: FilterPillOption[];
  selected: string[];
  onToggle: (value: string) => void;
};

function MultiSelectPills({
  label,
  options,
  selected,
  onToggle,
}: MultiPillProps) {
  const id = `filter-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="filter-pill-group" role="group" aria-labelledby={id}>
      <span id={id} className="filter-pill-label">
        {label}
      </span>
      <div className="filter-pills">
        {options.map((opt) => {
          const on = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              className={on ? "filter-pill is-selected" : "filter-pill"}
              aria-pressed={on}
              onClick={() => onToggle(opt.value)}
            >
              {opt.label}
              {typeof opt.count === "number" ? (
                <span className="filter-pill-count">{opt.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  status: MultiPillProps;
  adherence: MultiPillProps;
  goal: MultiPillProps;
  renewal: MultiPillProps;
  showClear: boolean;
  onClear: () => void;
  trailing?: ReactNode;
};

/** FilterBar: search + pills; Status/Adherence primary, Goal/Renewal in More. */
export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search clients",
  status,
  adherence,
  goal,
  renewal,
  showClear,
  onClear,
  trailing,
}: Props) {
  const moreSelected =
    goal.selected.length + renewal.selected.length;
  const [moreOpen, setMoreOpen] = useState(moreSelected > 0);
  useEffect(() => {
    if (moreSelected > 0) setMoreOpen(true);
  }, [moreSelected]);

  return (
    <div className="filter-bar" data-testid="filter-bar">
      <div className="filter-bar-row">
        <label className="filter-search">
          <Search size={16} strokeWidth={1.75} aria-hidden="true" />
          <span className="sr-only">Search</span>
          <input
            type="search"
            value={search}
            placeholder={searchPlaceholder}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </label>
        <MultiSelectPills {...status} />
        <MultiSelectPills {...adherence} />
        <button
          type="button"
          className={
            moreOpen || moreSelected > 0
              ? "filter-more is-active"
              : "filter-more"
          }
          aria-expanded={moreOpen}
          aria-controls="filter-bar-more"
          onClick={() => setMoreOpen((open) => !open)}
        >
          More{moreSelected > 0 ? ` (${moreSelected})` : ""}
        </button>
        {showClear ? (
          <button type="button" className="filter-clear link" onClick={onClear}>
            Clear
          </button>
        ) : null}
        {trailing}
      </div>
      {moreOpen ? (
        <div className="filter-bar-more" id="filter-bar-more">
          <MultiSelectPills {...goal} />
          <MultiSelectPills {...renewal} />
        </div>
      ) : null}
    </div>
  );
}
