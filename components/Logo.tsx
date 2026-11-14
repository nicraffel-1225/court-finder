// The header logo: the same shapes as public/logo.svg, minus its own green
// background square — the header bar it sits on is already --court green.
export function Logo() {
  return (
    <span className="logo">
      <svg
        className="logo-mark"
        width="38"
        height="38"
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect x="32" y="10" width="18" height="24" fill="var(--ball)" />
        <path
          d="M8 10H56V54H8Z M14 10V54 M50 10V54 M14 34H50 M32 10V34 M32 54V50"
          fill="none"
          stroke="var(--line)"
          strokeWidth="2.5"
        />
        <path d="M5 10H59" stroke="var(--line)" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <span className="logo-word">Court Finder</span>
    </span>
  );
}
