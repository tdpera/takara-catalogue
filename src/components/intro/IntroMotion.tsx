"use client";
/**
 * The introduction page's scroll choreography, in one small observer:
 *  - [data-reveal] elements get [data-in] the first time they scroll into view (CSS animates);
 *  - the "how it works" story sets [data-active] on its phone to the step being read;
 *  - the hero fades and drifts as it scrolls away (a CSS variable, --hero).
 * Before this runs (or without JavaScript) everything is simply visible: the hidden starting
 * states only apply once the page is marked [data-motion].
 */
import { useEffect } from "react";

export function IntroMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".intro");
    if (!root) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.setAttribute("data-motion", reduce ? "reduced" : "on");

    const reveal = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.setAttribute("data-in", "");
            reveal.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );
    root.querySelectorAll("[data-reveal]").forEach((el) => reveal.observe(el));

    const phone = root.querySelector<HTMLElement>("[data-phone]");
    const steps = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && phone) {
            const n = (e.target as HTMLElement).dataset.step!;
            phone.setAttribute("data-active", n);
            root.querySelectorAll("[data-step]").forEach((s) => s.toggleAttribute("data-current", s === e.target));
          }
        }
      },
      // phones: the phone sits at the top, so read the step just below it; wide screens: the middle
      { rootMargin: matchMedia("(min-width: 900px)").matches ? "-45% 0px -45% 0px" : "-60% 0px -22% 0px" },
    );
    root.querySelectorAll("[data-step]").forEach((el) => steps.observe(el));

    let raf = 0;
    const hero = root.querySelector<HTMLElement>(".intro-hero");
    const onScroll = () => {
      if (raf || reduce || !hero) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const p = Math.min(1, Math.max(0, window.scrollY / Math.max(1, hero.offsetHeight)));
        root.style.setProperty("--hero", p.toFixed(3));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // A soft spotlight that follows the mouse across the hero.
    const onPointer = (e: PointerEvent) => {
      if (!hero || e.pointerType !== "mouse" || reduce) return;
      const r = hero.getBoundingClientRect();
      hero.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      hero.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    };
    hero?.addEventListener("pointermove", onPointer, { passive: true });

    return () => {
      reveal.disconnect();
      steps.disconnect();
      window.removeEventListener("scroll", onScroll);
      hero?.removeEventListener("pointermove", onPointer);
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
