"use client";
/**
 * The live 3D ring on the introduction page (see ring-gl.ts for the drawing).
 *
 * - Turns slowly by itself; drag sideways to spin it (it keeps spinning and slows down), move the
 *   mouse or tilt an Android phone to tip it. Vertical swipes still scroll the page.
 * - A still gold ring (SVG) shows at once and stays if WebGL isn't available; the live one fades
 *   in over it after its first frame.
 * - Kind to phones: starts after the launch animation, pauses when off screen or in a background
 *   tab, renders at a reduced resolution and lowers it further if frames come too slowly.
 * - Reduced motion: one still frame, no animation loop.
 */
import { useEffect, useRef, useState } from "react";
import { createRing } from "./ring-gl";

export function RingHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    if (nav.connection?.saveData) return;
    const lowEnd = (nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2;
    let ring: ReturnType<typeof createRing> = null;
    let raf = 0;
    let visible = true;
    let started = false;
    let scale = Math.min(window.devicePixelRatio || 1, 1.5) * (lowEnd ? 0.55 : 0.85);

    // motion state
    let yaw = -0.4;
    let spin = 0.32; // rad/s, eases back to this after a drag
    let pitch = -0.06;
    let pitchTarget = -0.06;
    let dragging = false;
    let lastX = 0;
    let lastMoveT = 0;
    let t0 = performance.now();
    let prev = t0;
    const slow: number[] = [];

    const size = () => {
      if (!ring) return;
      const r = canvas.getBoundingClientRect();
      ring.resize(Math.max(64, Math.round(r.width * scale)), Math.max(64, Math.round(r.height * scale)));
    };

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      // adapt resolution: if frames keep arriving late, draw fewer pixels
      slow.push(now - prev);
      if (slow.length > 40) {
        const avg = slow.reduce((a, b) => a + b, 0) / slow.length;
        slow.length = 0;
        if (avg > 30 && scale > 0.4) {
          scale *= 0.8;
          size();
        }
      }
      prev = now;
      if (!dragging) spin += (0.32 - spin) * Math.min(1, dt * 1.6);
      // Like a jeweller's turntable: glide past the edge-on view, linger where the ring faces you.
      const linger = dragging ? 1 : 0.45 + 0.95 * Math.abs(Math.sin(yaw));
      yaw += spin * dt * linger;
      pitch += (pitchTarget - pitch) * Math.min(1, dt * 4);
      ring!.frame((now - t0) / 1000, yaw, pitch);
    };

    const loop = (now: number) => {
      draw(now);
      if (visible && !document.hidden) raf = requestAnimationFrame(loop);
      else raf = 0;
    };
    const kick = () => {
      if (!raf && visible && !document.hidden && started && !reduce) {
        prev = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };

    const start = () => {
      ring = createRing(canvas);
      if (!ring) return;
      size();
      t0 = performance.now();
      draw(t0 + 16);
      requestAnimationFrame(() => setLive(true));
      started = true;
      kick();
    };

    // Let the launch animation finish first (it needs the graphics chip more than we do).
    const splashOn = document.documentElement.getAttribute("data-splash") !== "off" && !reduce;
    const timer = window.setTimeout(start, splashOn ? 4300 : 60);

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      kick();
    });
    io.observe(canvas);
    const onVis = () => kick();
    document.addEventListener("visibilitychange", onVis);
    const ro = new ResizeObserver(() => {
      size();
      if (reduce && ring) draw(performance.now());
    });
    ro.observe(canvas);

    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastMoveT = performance.now();
    };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      if (e.pointerType === "mouse") pitchTarget = -0.06 + ((e.clientY - r.top) / r.height - 0.5) * 0.5;
      if (!dragging) return;
      const now = performance.now();
      const dx = e.clientX - lastX;
      const dts = Math.max(0.008, (now - lastMoveT) / 1000);
      yaw += (dx / r.width) * 4;
      spin = Math.max(-9, Math.min(9, ((dx / r.width) * 4) / dts));
      lastX = e.clientX;
      lastMoveT = now;
      if (reduce && ring) draw(now);
    };
    const onUp = () => {
      dragging = false;
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      pitchTarget = -0.06 + Math.max(-0.35, Math.min(0.35, (e.beta - 45) / 90));
      if (!dragging) spin = 0.32 + Math.max(-0.6, Math.min(0.6, e.gamma / 60));
    };
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("deviceorientation", onTilt);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("deviceorientation", onTilt);
      ring?.destroy();
    };
  }, []);

  return (
    <div className="ring-stage" aria-hidden="true">
      <div className="ring-glow" />
      {/* Still ring: shows instantly, and stays where live 3D isn't possible. */}
      <svg className={`ring-still ${live ? "is-hidden" : ""}`} viewBox="0 0 48 48" focusable="false">
        <defs>
          <linearGradient id="rs-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fbe7b0" />
            <stop offset="0.4" stopColor="#d9ab4e" />
            <stop offset="0.75" stopColor="#9c7330" />
            <stop offset="1" stopColor="#f1d38c" />
          </linearGradient>
        </defs>
        <ellipse cx="24" cy="29" rx="12.6" ry="13.6" fill="none" stroke="url(#rs-gold)" strokeWidth="2.6" />
        <path d="M24 9.5 28.5 13 24 18.5 19.5 13z" fill="#f4f1ea" stroke="#d9ab4e" strokeWidth="0.5" />
        <path d="M19.5 13h9M22 13l2-3.5 2 3.5" fill="none" stroke="#b6a98f" strokeWidth="0.3" />
      </svg>
      <canvas ref={canvasRef} className={`ring-canvas ${live ? "is-live" : ""}`} />
      <div className="ring-floor" />
    </div>
  );
}
