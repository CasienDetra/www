import type { SupabaseClient } from "@supabase/supabase-js";

// --- Types ---

export type FooterSignature = {
  id: string;
  user_id: string;
  name: string;
  message: string | null;
  signature_data: string;
  created_at: string;
};

export type SignaturePayload = {
  name: string;
  message: string | null;
  signature_data: string;
  stroke_count: number;
};

// --- Constants ---

const SIGNATURE_TABLE = "footer_signatures";
const SIGNATURE_FETCH_LIMIT = 120;
const SIGNATURE_NAME_MAX = 36;
const SIGNATURE_MESSAGE_MAX = 40;
const MIN_STROKES = 3;
const SIGN_INTENT_KEY = "footer-sign-intent";

// --- Visuals ---

function stableHash(seed: number, source: string) {
  let hash = seed;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 33 + source.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getSignatureRotation(id: string): number {
  const hash = stableHash(17, id);
  return ((hash % 15) - 7) * 0.9;
}

export function getSignatureOrder(id: string): number {
  return stableHash(23, id) % 10000;
}

export function getSignatureInkOpacity(id: string): number {
  const hash = stableHash(29, id);
  return Number((0.72 + ((hash % 100) / 100) * 0.2).toFixed(2));
}

// --- Auth helpers ---

export function getRedirectUrl(): string {
  const base =
    import.meta.env.PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}?sign=1`;
}

export function setSignIntent(active: boolean) {
  if (typeof sessionStorage === "undefined") return;
  if (active) {
    sessionStorage.setItem(SIGN_INTENT_KEY, "1");
  } else {
    sessionStorage.removeItem(SIGN_INTENT_KEY);
  }
}

export function hasSignIntent(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(SIGN_INTENT_KEY) === "1";
}

export function consumeSignFlag(): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  const wants = url.searchParams.get("sign") === "1";
  if (wants) {
    url.searchParams.delete("sign");
    history.replaceState({}, "", url.toString());
  }
  return wants;
}

export function extractTokensFromHash(): {
  access_token: string;
  refresh_token: string;
} | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  let hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const access = params.get("access_token");
  const refresh = params.get("refresh_token");

  if (access && refresh) {
    url.hash = "";
    history.replaceState({}, "", url.toString());
    return { access_token: access, refresh_token: refresh };
  }
  return null;
}

export function getCodeFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URL(window.location.href).searchParams.get("code");
}

export function clearAuthParamsFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("error_description");
  url.searchParams.delete("error");
  history.replaceState({}, "", url.toString());
}

// --- Service ---

export async function loadSignatures(
  client: SupabaseClient,
): Promise<FooterSignature[]> {
  const { data, error } = await client
    .from(SIGNATURE_TABLE)
    .select("id, user_id, name, message, signature_data, created_at")
    .order("created_at", { ascending: false })
    .limit(SIGNATURE_FETCH_LIMIT);

  if (error) throw error;
  return (data as FooterSignature[]) ?? [];
}

export async function userHasSignature(
  client: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from(SIGNATURE_TABLE)
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function submitSignature(
  accessToken: string,
  payload: SignaturePayload,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({ error: "Request failed" }));
  if (!res.ok) return { ok: false, error: body.error ?? "Save failed" };
  return { ok: true };
}

export { SIGNATURE_NAME_MAX, SIGNATURE_MESSAGE_MAX, MIN_STROKES };
