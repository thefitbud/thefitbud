import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "destructive"
  | "whatsapp";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
};

/**
 * Shared trainer-web button hierarchy (foundations §1.6.1 / §1.6.3).
 * whatsapp = neutral secondary with WhatsApp glyph styling via class.
 */
export function Button({
  variant = "primary",
  className = "",
  type = "button",
  children,
  ...rest
}: Props) {
  const variantClass =
    variant === "primary"
      ? "button-primary"
      : variant === "secondary" || variant === "whatsapp"
        ? "button-secondary"
        : variant === "tertiary"
          ? "button-ghost"
          : "button-destructive";
  return (
    <button
      type={type}
      className={`${variantClass}${variant === "whatsapp" ? " button-whatsapp" : ""} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
