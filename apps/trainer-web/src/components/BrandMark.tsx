type Props = {
  size?: number;
  className?: string;
  /** `inverse` = white dots for indigo/navy tiles (sidebar). */
  variant?: "default" | "inverse";
};

/** Honest Week four-dot mark from packages/brand/logo. */
export function BrandMark({
  size = 28,
  className = "",
  variant = "default",
}: Props) {
  const src =
    variant === "inverse" ? "/brand-mark-white.svg" : "/brand-mark.svg";
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      className={className}
      aria-hidden="true"
    />
  );
}
