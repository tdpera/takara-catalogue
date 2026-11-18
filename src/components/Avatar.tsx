/** Initials in a gold circle, for clients and team members. */
export function initials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "·";
  const letters = words.length === 1 ? [...words[0]].slice(0, 2) : [[...words[0]][0], [...words[words.length - 1]][0]];
  return letters.join("").toLocaleUpperCase();
}

export function Avatar({ name, size = 40 }: { name: string | null | undefined; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gold-soft font-semibold text-ink ring-1 ring-gold/20"
    >
      {initials(name)}
    </span>
  );
}
