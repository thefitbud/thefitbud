import type { Ref } from "react";
import { CalendarDays } from "lucide-react";
import { formatCivilDate } from "@fitbud/core";

/**
 * Date field that always reads as a civil date ("Mon 7 Sep"), never a native
 * mm/dd/yyyy string. The native picker sits over the formatted text.
 */
export function CivilDateField({
  id,
  label,
  value,
  min,
  max,
  invalid,
  describedBy,
  disabled,
  onChange,
  inputRef,
}: {
  id: string;
  label: string;
  value: string;
  min?: string;
  max?: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <label className={`plan-civil-date${invalid ? " is-invalid" : ""}`} htmlFor={id}>
      <span className="plan-civil-date-label">{label}</span>
      <span className="plan-civil-date-control">
        <span className="plan-civil-date-text" aria-hidden>
          {value ? formatCivilDate(value) : "Choose a date"}
        </span>
        <CalendarDays className="plan-civil-date-icon" size={18} strokeWidth={1.75} aria-hidden />
        <input
          ref={inputRef}
          id={id}
          type="date"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
          onClick={(event) => {
            try {
              event.currentTarget.showPicker?.();
            } catch {
              // showPicker is refused outside a user gesture; typing still works.
            }
          }}
        />
      </span>
    </label>
  );
}
