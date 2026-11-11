import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { FilterDropdown, type FilterDropdownProps } from "./FilterDropdown";

export type { FilterOption } from "./FilterDropdown";

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  status: FilterDropdownProps;
  adherence: FilterDropdownProps;
  goal: FilterDropdownProps;
  renewal: FilterDropdownProps;
  showClear: boolean;
  onClear: () => void;
  /** Right end of the same row (the Current/Ended switch, D-W8-13). */
  trailing?: ReactNode;
};

/**
 * Clients toolbar (frames 136 and 140, D-W8-13): one row with search, the
 * Status / Adherence / Goal / Renewal dropdowns, then `trailing` at the right.
 */
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
        <div className="filter-dropdowns" role="group" aria-label="Filters">
          <FilterDropdown {...status} />
          <FilterDropdown {...adherence} />
          <FilterDropdown {...goal} />
          <FilterDropdown {...renewal} />
          {showClear ? (
            <button type="button" className="filter-clear link" onClick={onClear}>
              Clear
            </button>
          ) : null}
        </div>
        {trailing ? <div className="filter-bar-trailing">{trailing}</div> : null}
      </div>
    </div>
  );
}
