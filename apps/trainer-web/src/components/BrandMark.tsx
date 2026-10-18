type Props = {
  size?: number;
  className?: string;
};

/** Honest Week four-dot mark from packages/brand/logo/mark.svg. */
export function BrandMark({ size = 28, className = "" }: Props) {
  return (
    <img
      src="/brand-mark.svg"
      width={size}
      height={size}
      alt=""
      className={className}
      aria-hidden="true"
    />
  );
}
