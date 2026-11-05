"use client";

import { useEffect, useRef } from "react";
import { KoiPondEngine } from "@/lib/koi";

export default function KoiPond() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const engine = new KoiPondEngine(canvas);
    const host = canvas.closest<HTMLElement>("[data-koi-pond]") ?? canvas.parentElement;
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest("a, button")) return;
      engine.feed(e.clientX, e.clientY);
    };
    host?.addEventListener("click", onClick);
    return () => {
      host?.removeEventListener("click", onClick);
      engine.destroy();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
    />
  );
}
