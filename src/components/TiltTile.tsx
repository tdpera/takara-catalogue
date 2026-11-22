"use client";
/**
 * A photo tile that behaves like a jeweller's glass display case: with a mouse it tilts towards
 * the pointer and a soft reflection follows it; on a phone, a tap sends a glint of light across.
 * Styles in globals.css (".tilt"). Does nothing for reduced motion.
 */
import { forwardRef, useRef } from "react";

type Props = React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode };

export const TiltTile = forwardRef<HTMLDivElement, Props>(function TiltTile({ className = "", children, ...rest }, ref) {
  const raf = useRef(0);
  const set = (el: HTMLElement, vars: Record<string, string>) => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v)));
  };
  return (
    <div
      ref={ref}
      {...rest}
      className={`tilt ${className}`}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const el = e.currentTarget;
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        el.classList.add("is-tilting");
        set(el, {
          "--rx": `${((0.5 - y) * 9).toFixed(2)}deg`,
          "--ry": `${((x - 0.5) * 11).toFixed(2)}deg`,
          "--mx": `${(x * 100).toFixed(1)}%`,
          "--my": `${(y * 100).toFixed(1)}%`,
          "--glare": "1",
        });
      }}
      onPointerLeave={(e) => {
        const el = e.currentTarget;
        el.classList.remove("is-tilting");
        set(el, { "--rx": "0deg", "--ry": "0deg", "--glare": "0" });
      }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        const el = e.currentTarget;
        el.classList.remove("glint");
        void el.offsetWidth; // restart the animation
        el.classList.add("glint");
      }}
    >
      {children}
    </div>
  );
});
