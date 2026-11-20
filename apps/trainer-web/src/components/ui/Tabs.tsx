export type TabItem = {
  id: string;
  label: string;
  count?: number;
};

type Props = {
  items: TabItem[];
  value: string;
  onChange?: (id: string) => void;
  "aria-label": string;
};

/** Page sections. Active tab is an ink underline. Counts stay neutral until active. */
export function Tabs({ items, value, onChange, "aria-label": ariaLabel }: Props) {
  return (
    <div className="ui-tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={selected ? "is-on" : undefined}
            onClick={() => onChange?.(item.id)}
          >
            {item.label}
            {item.count !== undefined ? <span className="ui-tabs-n">{item.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
