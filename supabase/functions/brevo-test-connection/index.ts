import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import {
  authenticateUser,
  AuthorizationError,
  requireAnyOrgAdmin,
} from "../_shared/auth/edgeAuthorization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Segue o mesmo padrão de bolt-test-connection/via-verde-test-connection:
// recebe a credencial DIRETAMENTE no body (nunca lida da BD), testa a
// ligação real ao provider, devolve { success, message?, error?, details? }.
// Ao contrário do wizard legado (Bolt/BP/etc não testam antes de gravar),
// este é chamado obrigatoriamente pelo IntegracaoDialog antes do insert —
// email errado e silencioso é pior do que um robot mal configurado.
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Relay para a Brevo com a chave do pedido: sem sessão de admin, qualquer
    // anónimo testava chaves alheias e gastava quota.
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

    const { api_key } = await req.json();

    if (!api_key || typeof api_key !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "api_key é obrigatória" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const response = await fetch("https://api.brevo.com/v3/account", {
      method: "GET",
      headers: { "api-key": api_key, accept: "application/json" },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: data.message || `Brevo recusou a API key (HTTP ${response.status})`,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Ligação à Brevo confirmada",
        details: {
          companyName: data.companyName,
          email: data.email,
          plan: data.plan,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: error.status, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Erro ao testar ligação à Brevo" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
