/** A friendly empty or "nothing found" panel with the app's mark, used across the app. */
export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-10 text-center">
      <div aria-hidden="true" className="flex size-16 items-center justify-center rounded-full bg-gold-soft">
        <svg width="34" height="34" viewBox="0 0 48 48">
          <circle cx="24" cy="28" r="13" fill="none" stroke="var(--gold)" strokeWidth="4" strokeDasharray="5 4" />
          <path d="M24 5 29.5 10.5 24 16 18.5 10.5z" fill="var(--gold)" />
        </svg>
      </div>
      <p className="max-w-xs font-display text-xl leading-snug">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}
