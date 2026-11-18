"use client";
import { useEffect, useState } from "react";

/**
 * Small spin preview from a sprite sheet. Turns by itself unless the user prefers reduced motion;
 * the slider turns it by hand (keyboard accessible). The full viewer arrives in step 5.
 */
export function SpinPreview({ src, frames, cols, label }: { src: string; frames: number; cols: number; label: string }) {
  const rows = Math.ceil(frames / cols);
  const [frame, setFrame] = useState(0);
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    setAuto(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % frames), 110);
    return () => clearInterval(id);
  }, [auto, frames]);

  const x = (frame % cols) * (100 / (cols - 1));
  const y = Math.floor(frame / cols) * (100 / (rows - 1));
  return (
    <div>
      <div
        role="img"
        aria-label={label}
        className="aspect-square w-40 rounded-xl border border-line bg-no-repeat"
        style={{ backgroundImage: `url(${src})`, backgroundSize: `${cols * 100}% ${rows * 100}%`, backgroundPosition: `${x}% ${y}%` }}
      />
      <input
        type="range"
        min={0}
        max={frames - 1}
        value={frame}
        aria-label={label}
        className="mt-2 w-40"
        onChange={(e) => {
          setAuto(false);
          setFrame(Number(e.target.value));
        }}
      />
    </div>
  );
}
