import { Minus, Plus } from "lucide-react";

type Props = {
  value: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  "aria-label": string;
};

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  suffix,
  "aria-label": ariaLabel,
}: Props) {
  return (
    <div className="ui-stepper" aria-label={ariaLabel}>
      <button
        type="button"
        aria-label={`Decrease ${ariaLabel}`}
        disabled={value <= min}
        onClick={() => onChange?.(Math.max(min, value - 1))}
      >
        <Minus className="ui-i" strokeWidth={1.75} aria-hidden />
      </button>
      <span>
        {value}
        {suffix ? <small>{suffix}</small> : null}
      </span>
      <button
        type="button"
        aria-label={`Increase ${ariaLabel}`}
        disabled={value >= max}
        onClick={() => onChange?.(Math.min(max, value + 1))}
      >
        <Plus className="ui-i" strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}
