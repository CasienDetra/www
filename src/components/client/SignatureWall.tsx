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
            className="text-3xl font-bold tracking-tight leading-none"
            style={{ transform: "scaleY(1.3)", transformOrigin: "left bottom" }}
          >
            sign
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Sign my website!
          </p>
        </div>
        {!hideAddButton && (
          <button
            type="button"
            onClick={onSign}
            disabled={authWaiting}
            className="shrink-0 px-4 py-2 rounded-xl border border-border bg-background text-sm font-mono hover:brightness-105 hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:cursor-progress disabled:transform-none"
          >
            {authWaiting ? "Waiting for login…" : "Add your signature ↗"}
          </button>
        )}
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground mb-3">Loading signatures…</p>
      )}
      {!loading && signatures.length === 0 && (
        <p className="text-sm text-muted-foreground mb-3">No signatures yet :(</p>
      )}
      {!supabaseConnected && (
        <p className="text-sm text-destructive mb-3">
          Supabase is not connected
        </p>
      )}
      {errorMessage && (
        <p className="text-sm text-destructive mb-3">{errorMessage}</p>
      )}

      <div
        className="grid gap-y-1 gap-x-2 items-center min-h-[8.5rem] md:min-h-[8.5rem] min-h-[5.5rem]"
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
              className="relative p-0 m-0 border-0 bg-transparent cursor-pointer transition-transform duration-150 hover:rotate-0 hover:scale-105"
              style={{
                transform: `rotate(${getSignatureRotation(sig.id)}deg)`,
              }}
              aria-label={`Signature by ${sig.name}`}
              title={
                sig.message
                  ? `[${sig.name}] ${sig.message}`
                  : sig.name
              }
            >
              <span
                className="block w-[clamp(92px,15vw,160px)] h-16 md:w-[clamp(70px,20vw,106px)] md:h-[42px] transition-all duration-150"
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
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
