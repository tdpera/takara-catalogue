/**
 * Launch animation: the gold ring draws itself, the stone pops in with a ripple, the name rises
 * in, then everything fades into the app. About 1.8 s, CSS only (see globals.css, "Splash").
 *
 * - Once per app session: a tiny script in <head> (SPLASH_SCRIPT) marks <html data-splash="off">
 *   before the first paint on later page loads, so it never flashes.
 * - Never blocks: the app renders underneath and taps pass through (pointer-events: none).
 * - Not on clients' share links (/s/…), which belong to the shop, and not at all for people who
 *   ask their phone for reduced motion.
 */
export function Splash({ name, tagline }: { name: string; tagline: string }) {
  return (
    <div className="splash" aria-hidden="true">
      <div className="splash-mark">
        <svg width="128" height="128" viewBox="0 0 48 48" focusable="false" overflow="visible">
          <defs>
            <linearGradient id="splash-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f6dc93" />
              <stop offset="0.45" stopColor="#c9962f" />
              <stop offset="1" stopColor="#8a5e14" />
            </linearGradient>
          </defs>
          <circle className="splash-ripple" cx="24" cy="28" r="14" fill="none" stroke="#e2bd6e" strokeWidth="0.8" />
          <circle
            className="splash-ring"
            cx="24"
            cy="28"
            r="14"
            fill="none"
            stroke="url(#splash-gold)"
            strokeWidth="5.5"
            strokeLinecap="round"
            pathLength={100}
            transform="rotate(-90 24 28)"
          />
          <g className="splash-gem">
            <path d="M24 4.5 30 10.5 24 16.5 18 10.5z" fill="url(#splash-gold)" />
            <path d="M24 4.5 30 10.5H18z" fill="#fff6dc" opacity="0.6" />
          </g>
        </svg>
      </div>
      <p className="splash-word">{name}</p>
      <div className="splash-line" />
      <p className="splash-tag">{tagline}</p>
    </div>
  );
}

/** Runs in <head> before the first paint: show the splash only on the first page of a session. */
export const SPLASH_SCRIPT = `try{var k="souq.splash",d=document.documentElement;if(sessionStorage.getItem(k)||location.pathname.indexOf("/s/")===0){d.setAttribute("data-splash","off")}else{sessionStorage.setItem(k,"1")}}catch(e){document.documentElement.setAttribute("data-splash","off")}`;
