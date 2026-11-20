import type { ReactNode } from "react";

type Props = {
  checked?: boolean;
  disabled?: boolean;
  labelledBy?: string;
  onChange?: (checked: boolean) => void;
  children?: ReactNode;
};

/** 36×20. On is done green, never coral. */
export function Toggle({
  checked = false,
  disabled = false,
  labelledBy,
  onChange,
  children,
}: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      className={`ui-tgl${checked ? " is-on" : ""}`}
      onClick={() => onChange?.(!checked)}
    >
      <i />
      {children}
    </button>
  );
}
