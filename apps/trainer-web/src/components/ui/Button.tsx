import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "quiet"
  | "ghost"
  | "danger"
  | "danger-quiet";

export type ButtonSize = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: boolean;
  children?: ReactNode;
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "ui-btn-primary",
  secondary: "ui-btn-secondary",
  quiet: "ui-btn-quiet",
  ghost: "ui-btn-ghost",
  danger: "ui-btn-danger",
  "danger-quiet": "ui-btn-danger-quiet",
};

/** Navy primary, one per view. Coral is never a button. */
export function Button({
  variant = "primary",
  size = "md",
  icon = false,
  className = "",
  type = "button",
  children,
  ...rest
}: Props) {
  const sizeClass = size === "sm" ? "ui-btn-sm" : size === "lg" ? "ui-btn-lg" : "";
  return (
    <button
      type={type}
      className={["ui-btn", VARIANT_CLASS[variant], sizeClass, icon ? "ui-btn-icon" : "", className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}
