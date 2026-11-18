"use client";
/**
 * 360° viewer for a sprite sheet (frames laid out in a grid, as made on the phone in step 3).
 *
 * - Drag sideways to turn; vertical drags still scroll the page (touch-action: pan-y).
 * - "full" mode is a keyboard slider: arrow keys, Home/End, PageUp/PageDown.
 * - Turns by itself only while on screen, never for users who prefer reduced motion, and stops
 *   for good once someone turns it by hand.
 * - All spins share one timer, and frames are drawn by moving a background, without re-rendering
 *   React, so a grid full of spins stays light on low-end phones.
 */
import { useEffect, useRef, useState } from "react";

const TICK_MS = 110;
const tickers = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
function addTicker(fn: () => void) {
  tickers.add(fn);
  timer ??= setInterval(() => {
    if (document.visibilityState !== "visible") return;
    tickers.forEach((f) => f());
  }, TICK_MS);
  return () => {
    tickers.delete(fn);
    if (tickers.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Props = {
  src: string;
  frames: number;
  cols: number;
  /** Accessible name, e.g. "Rope bangle, 360° view". */
  label: string;
  /** Text for the current frame, e.g. (n, total) => `Angle ${n} of ${total}`. Needed for "full". */
  frameText?: (n: number, total: number) => string;
  mode: "card" | "full";
  auto?: boolean;
  className?: string;
};

export function SpinViewer({ src, frames, cols, label, frameText, mode, auto = true, className = "" }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const visible = useRef(false);
  const stopped = useRef(false);
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  const [ready, setReady] = useState(false);
  const rows = Math.ceil(frames / cols);

  function show(i: number) {
    frame.current = ((i % frames) + frames) % frames;
    const node = el.current;
    if (!node) return;
    const f = frame.current;
    const x = cols > 1 ? (f % cols) * (100 / (cols - 1)) : 0;
    const y = rows > 1 ? Math.floor(f / cols) * (100 / (rows - 1)) : 0;
    node.style.backgroundPosition = `${x}% ${y}%`;
    if (mode === "full") {
      node.setAttribute("aria-valuenow", String(f + 1));
      if (frameText) node.setAttribute("aria-valuetext", frameText(f + 1, frames));
    }
  }

  // Load the sprite before showing it (the photo underneath stays visible until then).
  useEffect(() => {
    setReady(false);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => setReady(true);
    img.src = src;
    return () => {
      img.onload = null;
    };
  }, [src]);

  useEffect(() => {
    show(frame.current);
    const node = el.current;
    if (!node || !ready || !auto || prefersReducedMotion()) return;
    const io = new IntersectionObserver((es) => (visible.current = es[0]?.isIntersecting ?? false), { threshold: 0.1 });
    io.observe(node);
    const remove = addTicker(() => {
      if (visible.current && !stopped.current && !drag.current) show(frame.current + 1);
    });
    return () => {
      io.disconnect();
      remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, auto, frames, cols]);

  const handlers = {
    onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
      if (e.button !== 0) return;
      drag.current = { x: e.clientX, start: frame.current, moved: false };
    },
    onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      if (!d.moved && Math.abs(dx) > 6) {
        d.moved = true;
        stopped.current = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
      }
      if (!d.moved) return;
      // One full turn per ~1.4 widths of drag, like turning the piece in your hand.
      const per = (e.currentTarget.getBoundingClientRect().width * 1.4) / frames;
      show(d.start - Math.round(dx / per));
    },
    onPointerUp() {
      const d = drag.current;
      drag.current = null;
      // Swallow the click that ends a drag, so a card doesn't open after turning it.
      if (d?.moved) {
        const swallow = (ev: Event) => {
          ev.preventDefault();
          ev.stopPropagation();
        };
        el.current?.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => el.current?.removeEventListener("click", swallow, { capture: true }), 50);
      }
    },
    onPointerCancel() {
      drag.current = null;
    },
  };

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 6, PageDown: -6 };
    if (e.key in step) show(frame.current + step[e.key]);
    else if (e.key === "Home") show(0);
    else if (e.key === "End") show(frames - 1);
    else return;
    stopped.current = true;
    e.preventDefault();
  }

  const style: React.CSSProperties = {
    backgroundImage: ready ? `url("${src}")` : undefined,
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    backgroundRepeat: "no-repeat",
    touchAction: "pan-y",
  };
  const base = `absolute inset-0 select-none transition-opacity duration-200 motion-reduce:transition-none ${ready ? "opacity-100" : "opacity-0"} ${className}`;

  if (mode === "full") {
    return (
      <div
        ref={el}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={frames}
        aria-valuenow={1}
        aria-valuetext={frameText?.(1, frames)}
        className={base + " cursor-grab active:cursor-grabbing"}
        style={style}
        onKeyDown={onKeyDown}
        {...handlers}
      />
    );
  }
  return <div ref={el} aria-hidden="true" className={base} style={style} {...handlers} />;
}
