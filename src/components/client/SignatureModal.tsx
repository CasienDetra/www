"use client";

import { useRef, useState, useEffect } from "react";
import SignatureCanvas, {
  type SignatureCanvasHandle,
} from "./SignatureCanvas";
import {
  SIGNATURE_NAME_MAX,
  SIGNATURE_MESSAGE_MAX,
  MIN_STROKES,
} from "@/lib/signature";

interface Props {
  open: boolean;
  saving: boolean;
  error: string;
  signedInEmail: string;
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    message: string | null;
    signature_data: string;
    stroke_count: number;
  }) => void;
}

export default function SignatureModal({
  open,
  saving,
  error,
  signedInEmail,
  onClose,
  onSubmit,
}: Props) {
  const canvasRef = useRef<SignatureCanvasHandle>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [strokeCount, setStrokeCount] = useState(0);

  useEffect(() => {
    if (open) {
      setName("");
      setMessage("");
      setStrokeCount(0);
      canvasRef.current?.clear();
    }
  }, [open]);

  if (!open) return null;

  const canSubmit =
    name.trim().length > 0 && strokeCount >= MIN_STROKES && !saving;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({
      name: name.trim(),
      message: message.trim() || null,
      signature_data: canvasRef.current?.getDataUrl() ?? "",
      stroke_count: strokeCount,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="button"
      tabIndex={0}
      aria-label="Close signature modal"
    >
      <div className="w-full max-w-[580px] max-h-[90dvh] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Add your signature</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Add your name and signature, and a short message if you want! Keep
          things proper, I can remove anything for any reason. Thank you!
        </p>
        {signedInEmail && (
          <p className="text-xs font-mono text-primary">
            Signed in as {signedInEmail}
          </p>
        )}

        <div className="grid gap-3">
          <label className="grid gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase">Name *</span>
              <span className="text-xs text-muted-foreground font-mono">
                {name.length}/{SIGNATURE_NAME_MAX}
              </span>
            </div>
            <input
              type="text"
              maxLength={SIGNATURE_NAME_MAX}
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
          </label>

          <label className="grid gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase">Message</span>
              <span className="text-xs text-muted-foreground font-mono">
                {message.length}/{SIGNATURE_MESSAGE_MAX}
              </span>
            </div>
            <textarea
              rows={2}
              maxLength={SIGNATURE_MESSAGE_MAX}
              placeholder="Optional message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
          </label>
        </div>

        <SignatureCanvas ref={canvasRef} onStrokeChange={setStrokeCount} />

        {error && (
          <p className="text-sm text-destructive break-words">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border bg-muted text-sm font-mono hover:brightness-110 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-mono hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {saving ? "Saving…" : "Place!"}
          </button>
        </div>
      </div>
    </div>
  );
}
