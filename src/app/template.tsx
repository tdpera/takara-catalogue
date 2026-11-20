/**
 * Re-mounted on every navigation (unlike layout.tsx), so each new page fades in; the CSS lives in
 * globals.css (".route"). No client JavaScript involved.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route">{children}</div>;
}
