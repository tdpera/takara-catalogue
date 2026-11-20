import { Logo } from "./icons";

/** A calm empty or "nothing found" panel: the mark draws itself, then the message and action. */
export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 border-y border-line px-6 py-12 text-center">
      <Logo size={44} draw />
      <p className="pop-in max-w-xs font-display text-[1.45rem] leading-snug">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}
