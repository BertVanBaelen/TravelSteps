/** Decorative route line with day dots: the app's own motif (login screen, empty states). */
export function RouteLine({ className }: { className?: string }) {
  return (
    <svg
      className={`route-line${className ? ` ${className}` : ''}`}
      viewBox="0 0 260 120"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 100 C 60 100, 60 30, 120 40 S 190 100, 250 20"
        stroke="var(--brand)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="2 10"
      />
      <circle cx="10" cy="100" r="9" fill="var(--card)" stroke="var(--brand)" strokeWidth="4" />
      <circle cx="120" cy="40" r="9" fill="var(--brand)" />
      <circle cx="250" cy="20" r="11" fill="var(--accent)" stroke="var(--card)" strokeWidth="4" />
    </svg>
  );
}
