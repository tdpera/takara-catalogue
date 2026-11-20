/**
 * Launch animation, Maison style: on ivory, the fine gold ring draws itself, the stone's outline
 * follows with a small glint, the name appears letter by letter, a gold rule extends, then the
 * screen lifts away like a curtain. About 2.6 s, CSS only (see globals.css, "Splash").
 *
 * - Once per app session: a tiny script in <head> (SPLASH_SCRIPT) marks <html data-splash="off">
 *   before the first paint on later page loads, so it never flashes.
 * - Never blocks: the app renders underneath and taps pass through (pointer-events: none).
 * - Not on clients' share links (/s/…), which belong to the shop, and not at all for people who
 *   ask their phone for reduced motion.
 */
export function Splash({ name, tagline, city }: { name: string; tagline: string; city: string }) {
  // Letter by letter only for Latin names: Arabic, Hindi and Malayalam letters join or stack.
  const latin = /^[A-Za-z]+$/.test(name);
  return (
    <div className="splash" aria-hidden="true">
      <div className="splash-inner">
        <svg width="92" height="92" viewBox="0 0 48 48" focusable="false" overflow="visible">
          <circle
            className="splash-ring"
            cx="24"
            cy="28"
            r="14"
            fill="none"
            stroke="#b08a45"
            strokeWidth="1.25"
            pathLength={100}
            transform="rotate(-90 24 28)"
          />
          <path
            className="splash-gem"
            d="M24 4.5 30 10.5 24 16.5 18 10.5z"
            fill="none"
            stroke="#b08a45"
            strokeWidth="1.1"
            strokeLinejoin="round"
            pathLength={40}
          />
          <path className="splash-glint" d="M30.5 6.5 31.3 8.7 33.5 9.5 31.3 10.3 30.5 12.5 29.7 10.3 27.5 9.5 29.7 8.7z" fill="#d9b86f" />
        </svg>
        <p className="splash-word">
          {latin
            ? [...name.toUpperCase()].map((ch, i) => (
                <span key={i} style={{ "--i": i } as React.CSSProperties}>
                  {ch}
                </span>
              ))
            : <span>{name}</span>}
        </p>
        <div className="splash-line" />
        <p className="splash-tag caps">{tagline}</p>
      </div>
      <p className="splash-foot caps">{city}</p>
    </div>
  );
}

/** Runs in <head> before the first paint: show the splash only on the first page of a session. */
export const SPLASH_SCRIPT = `try{var k="souq.splash",d=document.documentElement;if(sessionStorage.getItem(k)||location.pathname.indexOf("/s/")===0){d.setAttribute("data-splash","off")}else{sessionStorage.setItem(k,"1")}}catch(e){document.documentElement.setAttribute("data-splash","off")}`;
