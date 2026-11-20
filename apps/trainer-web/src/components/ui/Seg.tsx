export type SegOption<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: SegOption<T>[];
  value: T;
  onChange?: (value: T) => void;
  full?: boolean;
  "aria-label": string;
};

/** One value among 2–4. Labels never wrap. */
export function Seg<T extends string>({
  options,
  value,
  onChange,
  full = false,
  "aria-label": ariaLabel,
}: Props<T>) {
  return (
    <div className={full ? "ui-seg is-full" : "ui-seg"} role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={option.value === value ? "is-on" : undefined}
          onClick={() => onChange?.(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
