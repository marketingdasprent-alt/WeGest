import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.105.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UBER_TOKEN_URL = "https://auth.uber.com/oauth/v2/token";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // integracao_id
    const error = url.searchParams.get("error");

    if (error) {
      console.error("OAuth error from Uber:", error, url.searchParams.get("error_description"));
      return redirectWithMessage(supabaseUrl, state, `Erro OAuth: ${error}`);
    }

    if (!code || !state) {
      return new Response(
        JSON.stringify({ success: false, error: "Parâmetros code e state são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const integracaoId = state;

    // Load integration config to get client_id and client_secret
    const { data: integracao, error: cfgError } = await supabase
      .from("plataformas_configuracao")
      .select("id, client_id, client_secret, redirect_uri")
      .eq("id", integracaoId)
      .eq("plataforma", "uber")
      .maybeSingle();

    if (cfgError || !integracao) {
      console.error("Integration not found:", cfgError?.message);
      return redirectWithMessage(supabaseUrl, integracaoId, "Integração não encontrada");
    }

    if (!integracao.client_id || !integracao.client_secret) {
      return redirectWithMessage(supabaseUrl, integracaoId, "Client ID e Client Secret são obrigatórios");
    }

    const redirectUri = integracao.redirect_uri || `${supabaseUrl}/functions/v1/uber-oauth-callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch(UBER_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: integracao.client_id,
        client_secret: integracao.client_secret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });

    const tokenText = await tokenResponse.text();

    if (!tokenResponse.ok) {
      console.error("Token exchange failed:", tokenResponse.status, tokenText);
      return redirectWithMessage(supabaseUrl, integracaoId, `Erro ao trocar code: ${tokenResponse.status}`);
    }

    const tokenData = JSON.parse(tokenText);
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in; // seconds

    if (!accessToken) {
      console.error("No access_token in response:", tokenData);
      return redirectWithMessage(supabaseUrl, integracaoId, "Resposta sem access_token");
    }

    // Calculate expiry
    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    // Save tokens
    const { error: updateError } = await supabase
      .from("plataformas_configuracao")
      .update({
        uber_access_token: accessToken,
        uber_refresh_token: refreshToken || null,
        uber_token_expires_at: expiresAt,
        last_oauth_at: new Date().toISOString(),
        oauth_enabled: true,
      })
      .eq("id", integracaoId);

    if (updateError) {
      console.error("Failed to save tokens:", updateError.message);
      return redirectWithMessage(supabaseUrl, integracaoId, "Erro ao guardar tokens");
    }

    console.log(`OAuth tokens saved for integration ${integracaoId}. Expires: ${expiresAt}`);

    // Log success
    await supabase.from("uber_sync_logs").insert({
      integracao_id: integracaoId,
      tipo: "oauth_callback",
      status: "success",
      mensagem: "Tokens OAuth obtidos com sucesso via Authorization Code flow",
      erros: 0,
      viagens_novas: 0,
      viagens_atualizadas: 0,
      detalhes: {
        has_refresh_token: !!refreshToken,
        expires_in: expiresIn,
        expires_at: expiresAt,
      },
    });

    // Redirect back to app
    return redirectWithMessage(supabaseUrl, integracaoId, null);
  } catch (err) {
    console.error("uber-oauth-callback error:", (err as Error).message);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function redirectWithMessage(supabaseUrl: string, integracaoId: string | null, errorMsg: string | null): Response {
  // Redirect to the app's admin settings page
  const siteUrl = Deno.env.get("SUPABASE_SITE_URL") || "https://decada-ousada.lovable.app";
  const params = new URLSearchParams();
  if (integracaoId) params.set("integracao_id", integracaoId);
  if (errorMsg) {
    params.set("uber_oauth_error", errorMsg);
  } else {
    params.set("uber_oauth_success", "true");
  }

  const redirectUrl = `${siteUrl}/admin/settings?${params.toString()}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectUrl,
      ...Object.fromEntries(Object.entries(corsHeaders)),
    },
  });
}
