import { useId, type ReactNode } from "react";
import "./read-only.css";

/**
 * Frame 179 / DS7 read-only style: a plain label and value, no input box,
 * counter or chevron. Use it for ended clients and any field that cannot be
 * edited; keep greyed disabled inputs only for controls that are briefly
 * unavailable (saving, offline). Decided 23 Oct; DS7 approved 3 Nov.
 *
 * Render inside `ReadOnlyFieldList`. The value's accessible name is the label
 * alone, so screen readers never hear counters or doubled date parts.
 */
export function ReadOnlyField({
  label,
  value,
  wide = false,
  testId,
}: {
  label: string;
  value: ReactNode;
  /** Span both columns (long text such as a goal description). */
  wide?: boolean;
  testId?: string;
}) {
  const labelId = useId();
  return (
    <div
      className={`readonly-field${wide ? " readonly-field-wide" : ""}`}
      data-testid={testId}
    >
      <dt id={labelId} className="readonly-field-label">
        {label}
      </dt>
      <dd aria-labelledby={labelId} className="readonly-field-value">
        {value}
      </dd>
    </div>
  );
}

/** Two columns from tablet width up, one column on phones. */
export function ReadOnlyFieldList({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <dl className="readonly-field-list" aria-label={label}>
      {children}
    </dl>
  );
}
