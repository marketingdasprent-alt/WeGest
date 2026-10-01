import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import {
  authenticateUser,
  AuthorizationError,
  requireAnyOrgAdmin,
} from "../_shared/auth/edgeAuthorization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BP_API_BASE = "https://api.fleet.bp.com";
const BP_TOKEN_URL = `${BP_API_BASE}/oauth/token`;
const BP_CARDS_URL = `${BP_API_BASE}/card-management/v1.0/cards`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Relay para a API da BP com credenciais do pedido: sem sessão de admin,
    // qualquer anónimo testava credenciais alheias e gastava quota.
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const user = await authenticateUser(req, {
      getUser: async (token) => {
        const { data, error } = await authClient.auth.getUser(token);
        return { user: error || !data.user ? null : { id: data.user.id } };
      },
    });
    const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await requireAnyOrgAdmin(user.id, async (userId) => {
      const { data, error } = await adminClient
        .from("user_organizacoes")
        .select("org_id")
        .eq("user_id", userId)
        .eq("is_admin", true)
        .limit(1)
        .maybeSingle();
      return !error && Boolean(data);
    });

    const { client_id, client_secret } = await req.json();

    if (!client_id || !client_secret) {
      return new Response(
        JSON.stringify({ success: false, error: "client_id e client_secret são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Get OAuth token
    const tokenResp = await fetch(BP_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id,
        client_secret,
      }),
    });

    if (!tokenResp.ok) {
      const err = await tokenResp.text();
      return new Response(
        JSON.stringify({ success: false, error: `Falha na autenticação BP: ${tokenResp.status}`, details: err }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;

    // 2. Test GET /cards
    const cardsResp = await fetch(`${BP_CARDS_URL}?limit=1`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!cardsResp.ok) {
      const err = await cardsResp.text();
      return new Response(
        JSON.stringify({ success: false, error: `API BP respondeu com ${cardsResp.status}`, details: err }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cardsData = await cardsResp.json();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Conexão BP Fleet bem sucedida!",
        total_cartoes: Array.isArray(cardsData?.cards) ? cardsData.cards.length : (cardsData?.total || 0),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: error.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.error("Erro bp-test-connection:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
