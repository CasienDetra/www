"use client";

import { useEffect, useRef } from "react";
import { KoiPondEngine } from "@/lib/koi";

export default function KoiPond() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const engine = new KoiPondEngine(canvas);
    return () => engine.destroy();
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
    />
  );
}
