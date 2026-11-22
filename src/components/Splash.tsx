/**
 * Launch animation, "through the ring" (CSS and SVG only; see globals.css, "Splash"):
 *  1. On black velvet, molten gold runs round the ring and settles (a turbulence filter whose
 *     strength falls to zero),
 *  2. the diamond drops into its setting and flashes, with a burst of light rays,
 *  3. TAKARA rises letter by letter in gold, with a light sweeping across it,
 *  4. then the camera flies through the ring: the ring grows past the edges of the screen while
 *     a hole the size of its centre opens onto the app underneath.
 * About 2.8 s. Once per app session; never on clients' share links; never for people who ask
 * their phone for reduced motion; taps pass straight through to the app.
 */
export function Splash({ name, tagline, city }: { name: string; tagline: string; city: string }) {
  // Letter by letter only for Latin names: Arabic, Hindi and Malayalam letters join or stack.
  const latin = /^[A-Za-z]+$/.test(name);
  return (
    <div className="splash" aria-hidden="true">
      <svg className="splash-ring" viewBox="0 4 48 48" focusable="false" overflow="visible">
        <defs>
          <linearGradient id="sp-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fbe7b0" />
            <stop offset="0.35" stopColor="#e2b85c" />
            <stop offset="0.7" stopColor="#b8862f" />
            <stop offset="1" stopColor="#f1d38c" />
          </linearGradient>
          <filter id="sp-molten" x="-30%" y="-30%" width="160%" height="160%">
            <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="7" result="n">
              <animate attributeName="baseFrequency" values="0.09;0.05" dur="1.4s" fill="freeze" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G">
              <animate attributeName="scale" values="5;2.5;0" keyTimes="0;0.6;1" dur="1.4s" fill="freeze" />
            </feDisplacementMap>
          </filter>
          <radialGradient id="sp-flash">
            <stop offset="0" stopColor="#fffbea" />
            <stop offset="0.35" stopColor="#ffe9a8" stopOpacity="0.8" />
            <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g filter="url(#sp-molten)">
          <circle className="sp-band" cx="24" cy="28" r="14" fill="none" stroke="url(#sp-gold)" strokeWidth="2.6" pathLength={100} transform="rotate(-90 24 28)" />
        </g>
        <g className="sp-gem">
          <path d="M24 4.5 30 10.5 24 16.5 18 10.5z" fill="url(#sp-gold)" />
          <path d="M24 4.5 30 10.5H18z" fill="#fffaf0" opacity="0.7" />
          <path d="M18 10.5h12M21 10.5 24 4.5 27 10.5M21 10.5l3 6 3-6" fill="none" stroke="#8a6013" strokeWidth="0.35" opacity="0.6" />
        </g>
        <g className="sp-rays" stroke="#ffe9a8" strokeWidth="0.45" strokeLinecap="round">
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <line key={i} x1={24 + Math.cos(a) * 5} y1={10.5 + Math.sin(a) * 5} x2={24 + Math.cos(a) * 11} y2={10.5 + Math.sin(a) * 11} />;
          })}
        </g>
        <circle className="sp-flash" cx="24" cy="10.5" r="9" fill="url(#sp-flash)" />
        <path className="sp-star" d="M24 2 25 9.5 32 10.5 25 11.5 24 19 23 11.5 16 10.5 23 9.5z" fill="#fffdf4" />
      </svg>
      <div className="splash-text">
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
