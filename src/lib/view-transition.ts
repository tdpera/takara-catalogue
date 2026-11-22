"use client";
/**
 * Shared-element page transitions: the tapped photo flies from the catalogue grid into the piece
 * page (and back). Uses the browser's View Transitions API where it exists (Chrome, Edge, Safari
 * 18+) and is skipped otherwise, for reduced motion, and for modified clicks (new tab etc.).
 *
 * How: the old element is given the name "piece-photo", the browser snapshots the page, we
 * navigate, and the new page's element with the same name calls `vtReady()` when it has mounted,
 * so the browser can morph one into the other. If the new page is slow (a weak connection), we
 * stop waiting after a moment and let it cross-fade instead of holding the screen.
 */
import type { useRouter } from "next/navigation";

type Router = ReturnType<typeof useRouter>;

export const VT_NAME = "piece-photo";
const WAIT_MS = 450;

type Pending = { resolve: () => void; backTo?: string };
declare global {
  interface Window {
    __takaraVT?: Pending;
  }
}

function canTransition(e?: React.MouseEvent) {
  if (typeof document === "undefined" || !("startViewTransition" in document)) return false;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return false;
  return true;
}

/**
 * Navigates with a morph from `from` (the element on this page) to the element on the next page
 * that calls vtReady(). `backTo` names the piece the catalogue should morph into (going back).
 */
export function navigateWithMorph(e: React.MouseEvent, router: Router, href: string, from: HTMLElement | null, backTo?: string) {
  if (!canTransition(e) || !from) return false;
  e.preventDefault();
  from.style.viewTransitionName = VT_NAME;
  // Marks the page while the flight is on (taps land on the transition layer until it ends).
  document.documentElement.setAttribute("data-vt", "");
  const t = document.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        window.__takaraVT = { resolve, backTo };
        router.push(href);
        window.setTimeout(resolve, WAIT_MS);
      }),
  );
  t.finished.finally(() => {
    document.documentElement.removeAttribute("data-vt");
    from.style.viewTransitionName = "";
    window.__takaraVT = undefined;
  });
  return true;
}

/** Is a morph on its way to this page? (Read once, when the page's element first renders.) */
export function morphPending() {
  return typeof window !== "undefined" && !!window.__takaraVT;
}

/** The new page's element is in place: name it and let the browser morph. */
export function vtReady(el: HTMLElement | null, pieceId?: string) {
  const p = typeof window !== "undefined" ? window.__takaraVT : undefined;
  if (!p) return;
  // The catalogue's cards answer only a morph back to their own piece; the piece page only a forward one.
  if (pieceId !== undefined ? p.backTo !== pieceId : p.backTo !== undefined) return;
  if (el) {
    el.style.viewTransitionName = VT_NAME;
    window.setTimeout(() => {
      el.style.viewTransitionName = "";
    }, 1200);
  }
  p.resolve();
}
