"use client";

import { useState, useEffect, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { FooterSignature, SignaturePayload } from "@/lib/signature";
import {
  loadSignatures,
  userHasSignature,
  submitSignature,
  getRedirectUrl,
  setSignIntent,
  hasSignIntent,
  consumeSignFlag,
  extractTokensFromHash,
  getCodeFromUrl,
  clearAuthParamsFromUrl,
} from "@/lib/signature";
import SignatureWall from "./SignatureWall";
import SignatureModal from "./SignatureModal";

export default function SignatureSection() {
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signatures, setSignatures] = useState<FooterSignature[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [hasSigned, setHasSigned] = useState(false);
  const [authWaiting, setAuthWaiting] = useState(false);

  const loadAll = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      setSignatures(await loadSignatures(supabase));
    } catch {
      setError("Could not load signatures");
    }
    setLoading(false);
  }, []);

  const refreshSession = useCallback(async () => {
    if (!supabase) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    setCurrentUser(user);
    if (user) {
      try {
        setHasSigned(await userHasSignature(supabase, user.id));
      } catch {
        setHasSigned(false);
      }
    } else {
      setHasSigned(false);
    }
  }, []);

  const finalizeAuth = useCallback(async () => {
    if (!supabase || typeof window === "undefined") return;

    const code = getCodeFromUrl();
    if (code) {
      const { error: err } = await supabase.auth.exchangeCodeForSession(code);
      if (err) setError(err.message);
      clearAuthParamsFromUrl();
      return;
    }

    const tokens = extractTokensFromHash();
    if (tokens) {
      const { error: err } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      if (err) setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let unsub: (() => void) | null = null;

    const setup = async () => {
      await loadAll();
      await finalizeAuth();
      await refreshSession();

      const signIntent = consumeSignFlag() || hasSignIntent();
      if (signIntent) {
        setSignIntent(false);
        if (!currentUser) {
          setAuthWaiting(true);
        }
      }

      // ponytail: null already guarded by early return above
      const client = supabase!;
      const { data: auth } = client.auth.onAuthStateChange(
        async (_event, session) => {
          const user = session?.user ?? null;
          setCurrentUser(user);
          setAuthWaiting(false);
          if (user) {
            try {
              setHasSigned(await userHasSignature(client, user.id));
            } catch {
              setHasSigned(false);
            }
            if (hasSignIntent()) {
              setSignIntent(false);
              setModalOpen(true);
            }
          }
        },
      );
      unsub = () => auth.subscription.unsubscribe();
    };

    setup();
    return () => unsub?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSignClick() {
    setError("");
    if (!supabase) {
      setError("Supabase is not configured");
      return;
    }
    await refreshSession();
    if (currentUser && !hasSigned) {
      setModalOpen(true);
      return;
    }
    if (hasSigned) {
      setError("You already signed");
      return;
    }
    setAuthWaiting(true);
    setSignIntent(true);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getRedirectUrl(),
        queryParams: { prompt: "select_account" },
      },
    });
    if (err) {
      setAuthWaiting(false);
      setSignIntent(false);
      setError(err.message);
    }
  }

  async function handleSubmit(payload: SignaturePayload) {
    setSaving(true);
    setError("");
    try {
      if (!supabase || !currentUser) {
        throw new Error("Please sign in first");
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Session expired, please sign in again");
      }
      const result = await submitSignature(session.access_token, payload);
      if (!result.ok) throw new Error(result.error);
      setHasSigned(true);
      setModalOpen(false);
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SignatureWall
        signatures={signatures}
        loading={loading}
        errorMessage={error}
        supabaseConnected={Boolean(supabase)}
        authWaiting={authWaiting}
        hideAddButton={Boolean(currentUser && hasSigned)}
        onSign={handleSignClick}
      />
      <SignatureModal
        open={modalOpen}
        saving={saving}
        error={error}
        signedInEmail={currentUser?.email ?? ""}
        onClose={() => {
          setModalOpen(false);
          setError("");
        }}
        onSubmit={handleSubmit}
      />
    </>
  );
}
