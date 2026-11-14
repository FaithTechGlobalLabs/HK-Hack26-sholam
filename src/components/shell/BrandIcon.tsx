/** sholam's mark: a speech bubble with a small cross inside. */
export function BibleChatIcon({
  className,
  strokeWidth = 2,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path
        className="brand-bubble"
        pathLength={1}
        d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"
      />
      <path className="brand-cross" pathLength={1} d="M12 7.5v8M9 10.5h6" />
    </svg>
  );
}
