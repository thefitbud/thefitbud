import type { ReactNode } from "react";

type FieldProps = {
  label: string;
  help?: string;
  children: ReactNode;
};

export function Field({ label, help, children }: FieldProps) {
  return (
    <div className="ui-field">
      <span className="ui-lbl">{label}</span>
      {children}
      {help ? <span className="ui-help">{help}</span> : null}
    </div>
  );
}

type TextInputProps = {
  value: string;
  icon?: ReactNode;
  focused?: boolean;
  caret?: boolean;
  onChange?: (value: string) => void;
  "aria-label": string;
};

export function TextInput({
  value,
  icon,
  focused = false,
  caret = false,
  onChange,
  "aria-label": ariaLabel,
}: TextInputProps) {
  return (
    <div className={`ui-input${focused ? " is-focus" : ""}`}>
      {icon}
      {onChange ? (
        <input aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <span>{value}</span>
      )}
      {caret ? <span className="ui-caret" aria-hidden /> : null}
    </div>
  );
}

type SelectFieldProps = {
  children: ReactNode;
  open?: boolean;
  chevron?: ReactNode;
  "aria-label": string;
};

export function SelectField({
  children,
  open = false,
  chevron,
  "aria-label": ariaLabel,
}: SelectFieldProps) {
  return (
    <button type="button" className={`ui-select${open ? " is-open" : ""}`} aria-label={ariaLabel} aria-expanded={open}>
      <span style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>{children}</span>
      {chevron}
    </button>
  );
}

type CheckProps = {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  children: ReactNode;
};

export function Checkbox({ checked = false, onChange, children }: CheckProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className={`ui-cbx${checked ? " is-on" : ""}`}
      onClick={() => onChange?.(!checked)}
    >
      <i />
      {children}
    </button>
  );
}

export function Radio({ checked = false, onChange, children }: CheckProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      className={`ui-rdo${checked ? " is-on" : ""}`}
      onClick={() => onChange?.(true)}
    >
      <i />
      {children}
    </button>
  );
}
