import type { ReactNode } from "react";
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

/** One-row FilterBar: search + multi-select pills (TW-06). */
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
  return (
    <div className="filter-bar" data-testid="filter-bar">
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
      <MultiSelectPills {...goal} />
      <MultiSelectPills {...renewal} />
      {showClear ? (
        <button type="button" className="filter-clear link" onClick={onClear}>
          Clear
        </button>
      ) : null}
      {trailing}
    </div>
  );
}
