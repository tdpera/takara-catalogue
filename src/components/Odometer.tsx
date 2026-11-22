/**
 * Figures that roll into place: each digit is a strip of 0–9 that spins down to its value
 * (right-most digit first). `flap` makes it a split-flap rate board instead: the strip jumps
 * one character at a time with a flap falling over each change.
 *
 * Pure CSS (see globals.css, "Odometer"), so it works in server components. The real digits stay
 * in the page as (transparent) text: screen readers, copying and tests read the true value; only
 * the rolling strips are decoration. `trigger="parent"` waits until an ancestor gets [data-in]
 * (set when it scrolls into view) or [data-active] matches; by default it rolls on arrival.
 */
export function Odometer({
  value,
  flap = false,
  trigger = "load",
  className = "",
}: {
  value: string;
  flap?: boolean;
  trigger?: "load" | "parent";
  className?: string;
}) {
  const chars = [...value];
  let fromRight = 0;
  const keyed = chars
    .map((ch, i) => ({ ch, i }))
    .reverse()
    .map((x) => ({ ...x, k: /\d/.test(x.ch) ? fromRight++ : -1 }))
    .reverse();
  return (
    <span dir="ltr" className={`odo ${flap ? "odo-flap" : ""} ${trigger === "parent" ? "odo-wait" : ""} ${className}`}>
      {keyed.map(({ ch, i, k }) =>
        k >= 0 ? (
          <span key={i} className="odo-d" style={{ "--d": Number(ch), "--n": Number(ch) + 10, "--k": k } as React.CSSProperties}>
            <span className="odo-v">{ch}</span>
          </span>
        ) : (
          <span key={i} className="odo-s">
            {ch}
          </span>
        ),
      )}
    </span>
  );
}
