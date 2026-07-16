import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

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
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Erro ao testar ligação à Brevo" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
