"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { MIN_STROKES } from "@/lib/signature";

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  width: number;
  points: Point[];
}

export interface SignatureCanvasHandle {
  getDataUrl: () => string;
  getStrokeCount: () => number;
  clear: () => void;
}

const CANVAS_W = 520;
const CANVAS_H = 280;
const STROKE_WIDTH = 5;

function getPoint(e: PointerEvent, canvas: HTMLCanvasElement): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * canvas.width,
    y: ((e.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function renderStroke(
  stroke: Stroke,
  ctx: CanvasRenderingContext2D,
  color: string,
) {
  if (!stroke.points.length) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (stroke.points.length === 1) {
    const p = stroke.points[0];
    ctx.arc(p.x, p.y, stroke.width / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export default function SignatureCanvas({
  ref,
  onStrokeChange,
}: {
  ref?: React.Ref<SignatureCanvasHandle>;
  onStrokeChange?: (count: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const currentStroke = useRef<Stroke | null>(null);
  const drawing = useRef(false);
  const accentColor = useRef("#000");

  const renderAll = useCallback(
    (strokesToRender: Stroke[], current: Stroke | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const color = accentColor.current;
      for (const s of strokesToRender) renderStroke(s, ctx, color);
      if (current) renderStroke(current, ctx, color);
    },
    [],
  );

  useEffect(() => {
    const updateAccent = () => {
      const v = getComputedStyle(document.documentElement)
        .getPropertyValue("--primary")
        .trim();
      accentColor.current = v || "#000";
      renderAll(strokes, currentStroke.current);
    };
    updateAccent();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", updateAccent);
    return () => mq.removeEventListener("change", updateAccent);
  }, [strokes, renderAll]);

  useEffect(() => {
    renderAll(strokes, null);
  }, [strokes, renderAll]);

  useEffect(() => {
    onStrokeChange?.(strokes.length);
  }, [strokes, onStrokeChange]);

  const startStroke = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || !canvasRef.current) return;
      drawing.current = true;
      const point = getPoint(e.nativeEvent, canvasRef.current);
      currentStroke.current = { width: STROKE_WIDTH, points: [point] };
      canvasRef.current.setPointerCapture(e.pointerId);
      renderAll(strokes, currentStroke.current);
    },
    [strokes, renderAll],
  );

  const continueStroke = useCallback(
    (e: React.PointerEvent) => {
      if (!drawing.current || !currentStroke.current || !canvasRef.current)
        return;
      const point = getPoint(e.nativeEvent, canvasRef.current);
      currentStroke.current = {
        ...currentStroke.current,
        points: [...currentStroke.current.points, point],
      };
      renderAll(strokes, currentStroke.current);
    },
    [strokes, renderAll],
  );

  const endStroke = useCallback(() => {
    if (!drawing.current || !currentStroke.current) return;
    drawing.current = false;
    if (currentStroke.current.points.length > 0) {
      setStrokes((prev) => [...prev, currentStroke.current!]);
      setRedoStack([]);
    }
    currentStroke.current = null;
  }, []);

  const undo = useCallback(() => {
    setStrokes((prev) => {
      if (!prev.length) return prev;
      const next = prev.slice(0, -1);
      setRedoStack((r) => [...r, prev[prev.length - 1]]);
      return next;
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (!prev.length) return prev;
      const next = prev.slice(0, -1);
      setStrokes((s) => [...s, prev[prev.length - 1]]);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setStrokes([]);
    setRedoStack([]);
    currentStroke.current = null;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  useEffect(() => {
    if (ref && typeof ref === "object") {
      ref.current = {
        getDataUrl: () =>
          canvasRef.current?.toDataURL("image/png") ?? "",
        getStrokeCount: () => strokes.length,
        clear,
      };
    }
  }, [ref, strokes.length, clear]);

  const hasStrokes = strokes.length > 0;
  const notEnoughStrokes = strokes.length < MIN_STROKES;

  return (
    <div className="relative rounded-xl border border-border bg-muted/30 overflow-hidden aspect-[520/280]">
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="relative z-10 block w-full h-full cursor-crosshair touch-none"
        onPointerDown={startStroke}
        onPointerMove={continueStroke}
        onPointerUp={endStroke}
        onPointerLeave={endStroke}
        onPointerCancel={endStroke}
      />
      <div className="absolute right-2 bottom-2 z-20 flex gap-1 rounded-lg border border-border bg-background/90 backdrop-blur px-2 py-1">
        <button
          type="button"
          onClick={undo}
          disabled={!hasStrokes}
          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          aria-label="Undo"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!redoStack.length}
          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          aria-label="Redo"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={!hasStrokes}
          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          aria-label="Clear"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
      {notEnoughStrokes && hasStrokes && (
        <p className="absolute left-2 bottom-2 z-20 text-xs text-muted-foreground">
          Draw at least {MIN_STROKES} strokes
        </p>
      )}
    </div>
  );
}
