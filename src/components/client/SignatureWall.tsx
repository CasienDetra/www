"use client";

import type { FooterSignature } from "@/lib/signature";
import {
  getSignatureInkOpacity,
  getSignatureOrder,
  getSignatureRotation,
} from "@/lib/signature";

interface Props {
  signatures: FooterSignature[];
  loading: boolean;
  errorMessage: string;
  supabaseConnected: boolean;
  authWaiting: boolean;
  hideAddButton: boolean;
  onSign: () => void;
}

export default function SignatureWall({
  signatures,
  loading,
  errorMessage,
  supabaseConnected,
  authWaiting,
  hideAddButton,
  onSign,
}: Props) {
  const sorted = [...signatures].sort(
    (a, b) => getSignatureOrder(a.id) - getSignatureOrder(b.id),
  );

  return (
    <section className="max-w-4xl mx-auto mb-8 px-3">
      <div className="flex items-center justify-between gap-5 mb-6">
        <div>
          <h3
            className="text-3xl font-semibold tracking-tight leading-none"
            style={{ transform: "scaleY(1.3)", transformOrigin: "left bottom" }}
          >
            sign
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Sign my website
          </p>
        </div>
        {!hideAddButton && supabaseConnected && (
          <button
            type="button"
            onClick={onSign}
            disabled={authWaiting}
            className="shrink-0 px-4 py-2 rounded-md border border-border bg-background text-sm font-mono hover:bg-muted transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:opacity-70 disabled:cursor-progress"
          >
            {authWaiting ? "Waiting for login…" : "Add your signature"}
          </button>
        )}
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground mb-3">Loading signatures…</p>
      )}
      {!loading && signatures.length === 0 && (
        <p className="text-sm text-muted-foreground mb-3">No signatures yet</p>
      )}
      {errorMessage && (
        <p className="text-sm text-destructive mb-3">{errorMessage}</p>
      )}

      <div
        className="grid gap-y-1 gap-x-2 items-center min-h-[5.5rem] md:min-h-[8.5rem]"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
        }}
        aria-live="polite"
      >
        {sorted.map((sig, i) => (
          <div
            key={sig.id}
            className="flex justify-center order-none"
            style={{
              order: getSignatureOrder(sig.id),
            }}
          >
            <button
              type="button"
              className="group relative p-0 m-0 border-0 bg-transparent cursor-pointer transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:rotate-0"
              style={{
                transform: `rotate(${getSignatureRotation(sig.id)}deg)`,
              }}
              aria-label={`Signature by ${sig.name}`}
            >
              <span
                className="block w-[clamp(92px,15vw,160px)] h-16 md:w-[clamp(70px,20vw,106px)] md:h-[42px]"
                style={{
                  backgroundColor: "var(--primary)",
                  WebkitMaskImage: `url('${sig.signature_data}')`,
                  maskImage: `url('${sig.signature_data}')`,
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                  WebkitMaskPosition: "center",
                  maskPosition: "center",
                  WebkitMaskSize: "contain",
                  maskSize: "contain",
                  opacity: getSignatureInkOpacity(sig.id),
                }}
                aria-hidden="true"
              />
              <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-mono opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] z-10">
                <span className="font-semibold">{sig.name}</span>
                {sig.message && (
                  <span className="text-muted-foreground ml-1.5">{sig.message}</span>
                )}
              </div>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
