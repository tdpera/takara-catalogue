/**
 * Launch animation: a short rendered film (public/splash/ring-v1.*, made by
 * scripts/splash-film/render.mjs). Molten gold pours, runs round the ring and cools to polished
 * gold, the stone is set and flares; the name rises in; then we fly through the ring into the app.
 *
 * - Once per app session (SPLASH_SCRIPT in <head> marks later pages data-splash="off" before
 *   anything is drawn); never on clients' share links; never for reduced motion.
 * - The film is only requested when the splash actually plays (SPLASH_RUN adds its sources), and
 *   is cached for a year, so a phone downloads it once (about 0.6 MB).
 * - If it can't start within 1.4 s (slow connection, Save-Data, autoplay blocked), a still of the
 *   finished ring with a CSS glint plays instead. A failsafe hides the splash after 7 s whatever
 *   happens, and taps always pass straight through to the app.
 */
export const SPLASH_FILM = "/splash/ring-v1";

export function Splash({ name, tagline, city }: { name: string; tagline: string; city: string }) {
  // Letter by letter only for Latin names: Arabic, Hindi and Malayalam letters join or stack.
  const latin = /^[A-Za-z]+$/.test(name);
  return (
    <div className="splash" aria-hidden="true" suppressHydrationWarning>
      <div className="splash-stage">
        {/* Sources carry data-src, not src: nothing downloads unless SPLASH_RUN decides to play. The
            script only sets attributes, never adds elements, so React's hydration leaves it alone. */}
        <video className="splash-film" muted playsInline preload="none" disablePictureInPicture disableRemotePlayback tabIndex={-1} suppressHydrationWarning>
          <source data-src={`${SPLASH_FILM}.webm`} type="video/webm" suppressHydrationWarning />
          <source data-src={`${SPLASH_FILM}.mp4`} type="video/mp4" suppressHydrationWarning />
        </video>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="splash-still" src={`${SPLASH_FILM}.jpg`} alt="" loading="lazy" decoding="async" />
        <i className="splash-glint" />
      </div>
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
export const SPLASH_SCRIPT = `try{var k="souq.splash",d=document.documentElement;if(sessionStorage.getItem(k)||location.pathname.indexOf("/s/")===0||matchMedia("(prefers-reduced-motion: reduce)").matches){d.setAttribute("data-splash","off")}else{sessionStorage.setItem(k,"1")}}catch(e){document.documentElement.setAttribute("data-splash","off")}`;

/**
 * Runs right after the splash markup: starts the film, and picks the mode the CSS timeline runs in
 * (data-mode="film" when it's playing, "still" if it isn't within 1.4 s).
 */
export const SPLASH_RUN = `(function(){try{var d=document.documentElement;if(d.getAttribute("data-splash")==="off")return;
var s=document.querySelector(".splash");if(!s)return;var v=s.querySelector("video");
var go=function(m){if(s.getAttribute("data-mode"))return;s.setAttribute("data-mode",m);if(m==="still"&&v){try{v.pause()}catch(e){}}};
var c=navigator.connection;if(!v||(c&&c.saveData)){go("still");return;}
var ss=v.querySelectorAll("source");for(var i=0;i<ss.length;i++)ss[i].src=ss[i].getAttribute("data-src");
v.addEventListener("playing",function(){go("film")},{once:true});
v.addEventListener("error",function(){go("still")},true);
v.preload="auto";v.load();var p=v.play();if(p&&p.catch)p.catch(function(){go("still")});
setTimeout(function(){go("still")},1400);}catch(e){}})();`;
