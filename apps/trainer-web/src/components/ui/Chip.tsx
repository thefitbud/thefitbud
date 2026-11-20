import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  children: ReactNode;
};

/** Filter chip. Selected is ink fill. */
export function Chip({ selected = false, className = "", type = "button", children, ...rest }: Props) {
  return (
    <button
      type={type}
      className={`ui-chip${selected ? " is-on" : ""} ${className}`.trim()}
      aria-pressed={selected}
      {...rest}
    >
      {children}
    </button>
  );
}
