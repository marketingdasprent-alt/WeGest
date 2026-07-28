import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Cartrack Fleet API — HTTP Basic Auth. Base URL por região (ISO alpha-2).
// Portugal = fleetapi-pt.cartrack.com. Ver developer.cartrack.com.
const CARTRACK_REGION = "pt";
const CARTRACK_API_BASE = `https://fleetapi-${CARTRACK_REGION}.cartrack.com/rest`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return new Response(
        JSON.stringify({ success: false, error: "username e password são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const auth = "Basic " + btoa(`${username}:${password}`);

    // Testar GET /vehicles — endpoint mais básico da Fleet API.
    const resp = await fetch(`${CARTRACK_API_BASE}/vehicles`, {
      headers: { Authorization: auth, Accept: "application/json" },
    });

    if (!resp.ok) {
      const err = await resp.text();
      const msg =
        resp.status === 401
          ? "Credenciais inválidas (401). Verifique username/password da Fleetweb → API Settings."
          : `API Cartrack respondeu com ${resp.status}`;
      return new Response(
        JSON.stringify({ success: false, error: msg, details: err.slice(0, 500) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await resp.json();
    // A API pode devolver { data: [...] } ou um array directo — contar defensivamente.
    const list = Array.isArray(data)
      ? data
      : data?.data || data?.vehicles || data?.results || [];
    const total = Array.isArray(list) ? list.length : 0;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Ligação Cartrack bem sucedida!",
        total_viaturas: total,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro cartrack-test-connection:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
