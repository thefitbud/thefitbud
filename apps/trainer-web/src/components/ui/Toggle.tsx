import type { ReactNode } from "react";

type Props = {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  children?: ReactNode;
};

/** 36×20. On is done green, never coral. */
export function Toggle({ checked = false, onChange, children }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`ui-tgl${checked ? " is-on" : ""}`}
      onClick={() => onChange?.(!checked)}
    >
      <i />
      {children}
    </button>
  );
}
