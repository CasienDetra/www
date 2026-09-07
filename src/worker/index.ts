import { createClient } from "@supabase/supabase-js";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    if (url.pathname === "/api/sign" && request.method === "POST") {
      return handleSign(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },
};

const MIN_STROKES = 3;
const SIGNATURE_TABLE = "footer_signatures";

async function handleSign(request: Request, env: Env): Promise<Response> {
  const json = (data: Record<string, unknown>, status = 200) =>
    Response.json(data, { status, headers: CORS });

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing auth token" }, 401);
  }

  const token = authHeader.slice(7);
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return json({ error: "Invalid auth token" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { name, message, signature_data, stroke_count } = body as {
    name?: string;
    message?: string | null;
    signature_data?: string;
    stroke_count?: number;
  };

  if (!name?.trim()) return json({ error: "Name is required" }, 400);
  if (name.trim().length > 36)
    return json({ error: "Name too long" }, 400);
  if (
    !signature_data ||
    typeof signature_data !== "string" ||
    !signature_data.startsWith("data:image/png;base64,")
  ) {
    return json({ error: "Invalid signature" }, 400);
  }
  if (typeof stroke_count !== "number" || stroke_count < MIN_STROKES) {
    return json(
      { error: `Please draw a signature (at least ${MIN_STROKES} strokes)` },
      400,
    );
  }

  // ponytail: duplicate check is explicit because UNIQUE index alone
  // gives a cryptic 23505 error; this gives a human message.
  const { data: existing } = await supabase
    .from(SIGNATURE_TABLE)
    .select("id")
    .eq("user_id", user.id)
    .limit(1);

  if (existing && existing.length > 0) {
    return json({ error: "You already signed" }, 409);
  }

  const { error: insertError } = await supabase
    .from(SIGNATURE_TABLE)
    .insert({
      user_id: user.id,
      name: name.trim(),
      message: message?.trim() || null,
      signature_data,
    });

  if (insertError) {
    if (insertError.code === "23505") {
      return json({ error: "You already signed" }, 409);
    }
    return json({ error: "Save failed" }, 500);
  }

  return json({ ok: true });
}
