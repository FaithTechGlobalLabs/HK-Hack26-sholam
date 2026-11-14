import type { CSSProperties } from "react";
import { BRAND_NAME } from "@/lib/brand";

/**
 * The mark: a cross drawn as a cloud, billowing only along its sunlit
 * top edges. It echoes the cross-shaped cloud in the sky behind the app.
 * The same geometry lives in src/app/icon.svg (favicon) and
 * public/brand/sholam-mark.svg; keep them in step.
 */

const MARK_OFFSET = "translate(0 0.65)";

/** The two bars of the cross. Corner radius 3.5 is half their thickness. */
const BARS = [
  { name: "upright", x: 12.5, y: 5.2, width: 7, height: 23.3 },
  { name: "beam", x: 3.5, y: 10.5, width: 25, height: 7 },
] as const;
const BAR_RADIUS = 3.5;

/** The billows along the sunlit top edges, as [cx, cy, r]. */
const PUFFS = [
  [16.6, 5.6, 3.4],
  [13.9, 7.7, 2.1],
  [7.2, 11, 2.4],
  [10.3, 10.2, 2.2],
  [21.9, 10.1, 2.3],
  [25, 11.1, 2.3],
] as const;

const MARK_SHAPES = (
  <g transform={MARK_OFFSET}>
    {BARS.map((bar) => (
      <rect
        key={bar.name}
        x={bar.x}
        y={bar.y}
        width={bar.width}
        height={bar.height}
        rx={BAR_RADIUS}
      />
    ))}
    {PUFFS.map(([cx, cy, r]) => (
      <circle key={`${cx},${cy}`} cx={cx} cy={cy} r={r} />
    ))}
  </g>
);

/**
 * A bar's centre line. A round-capped stroke as thick as the bar traces
 * exactly the outline of the rounded rect (radius = half the thickness).
 */
function barCentreLine(bar: (typeof BARS)[number]) {
  const half = Math.min(bar.width, bar.height) / 2;
  const at = (n: number) => Math.round(n * 100) / 100;
  const start = `M${at(bar.x + half)} ${at(bar.y + half)}`;
  return bar.width > bar.height
    ? `${start}H${at(bar.x + bar.width - half)}`
    : `${start}V${at(bar.y + bar.height - half)}`;
}

/**
 * The same mark as `LogoMark`, with each piece exposed for animation (the
 * launch screen). The bars are round-capped strokes along their centre
 * lines (`logo-bar logo-bar-upright|beam`, `pathLength` 1) so they can be
 * drawn on with a dash without their round ends deforming; each billow is a
 * `logo-puff` carrying its centre x as `--cx` for a left-to-right stagger.
 * Always decorative.
 */
export function LogoMarkParts({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <g transform={MARK_OFFSET}>
        {BARS.map((bar) => (
          <path
            key={bar.name}
            className={`logo-bar logo-bar-${bar.name}`}
            d={barCentreLine(bar)}
            fill="none"
            stroke="currentColor"
            strokeWidth={Math.min(bar.width, bar.height)}
            strokeLinecap="round"
            pathLength={1}
          />
        ))}
        {PUFFS.map(([cx, cy, r]) => (
          <circle
            key={`${cx},${cy}`}
            className="logo-puff"
            cx={cx}
            cy={cy}
            r={r}
            style={{ "--cx": cx } as CSSProperties}
          />
        ))}
      </g>
    </svg>
  );
}

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
