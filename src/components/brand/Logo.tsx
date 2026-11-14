import { BRAND_NAME } from "@/lib/brand";

/**
 * The mark: a cross drawn as a cloud, billowing only along its sunlit
 * top edges. It echoes the cross-shaped cloud in the sky behind the app.
 * The same geometry lives in src/app/icon.svg (favicon) and
 * public/brand/sholam-mark.svg; keep them in step.
 */

const MARK_SHAPES = (
  <g transform="translate(0 0.65)">
    <rect x="12.5" y="5.2" width="7" height="23.3" rx="3.5" />
    <rect x="3.5" y="10.5" width="25" height="7" rx="3.5" />
    <circle cx="16.6" cy="5.6" r="3.4" />
    <circle cx="13.9" cy="7.7" r="2.1" />
    <circle cx="7.2" cy="11" r="2.4" />
    <circle cx="10.3" cy="10.2" r="2.2" />
    <circle cx="21.9" cy="10.1" r="2.3" />
    <circle cx="25" cy="11.1" r="2.3" />
  </g>
);

/** The mark alone, in `currentColor`. Decorative unless a `title` is given. */
export function LogoMark({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {MARK_SHAPES}
    </svg>
  );
}

/** Mark + wordmark, as it sits top-left in the header. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={
        className
          ? `inline-flex items-center gap-2 ${className}`
          : "inline-flex items-center gap-2"
      }
    >
      <LogoMark className="size-6 shrink-0" />
      <span className="font-semibold text-[17px] leading-none tracking-tight">
        {BRAND_NAME}
      </span>
    </span>
  );
}
