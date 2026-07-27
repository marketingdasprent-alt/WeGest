import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Sync automático do Cartrack — invocado pelo pg_cron a cada 15 min
// (ver migração cartrack_cron). Percorre dinamicamente todas as integrações
// Cartrack ativas com sync_automatico ligado e chama o cartrack-sync de cada.
// Novos tenants são apanhados automaticamente, sem migrations adicionais
// (mesmo padrão do via-verde-scheduled-sync).
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: integracoes, error } = await supabase
      .from("plataformas_configuracao")
      .select("id, nome, sync_automatico")
      .eq("plataforma", "cartrack")
      .eq("ativo", true);

    if (error) throw error;

    // sync_automatico null = ligado por defeito (o módulo é automático).
    const alvo = (integracoes || []).filter((i: any) => i.sync_automatico !== false);

    const results: any[] = [];
    for (const intg of alvo) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/cartrack-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ integracao_id: intg.id }),
        });
        const body = await resp.json().catch(() => ({}));
        results.push({
          integracao_id: intg.id,
          nome: intg.nome,
          ok: resp.ok && body?.success === true,
          vehicles: body?.vehicles?.upserted ?? null,
          error: body?.success ? null : body?.error ?? `HTTP ${resp.status}`,
        });
      } catch (e: any) {
        console.error(`cartrack-scheduled-sync ${intg.id}:`, e);
        results.push({ integracao_id: intg.id, nome: intg.nome, ok: false, error: e.message });
      }
    }

    return new Response(
      JSON.stringify({ success: true, total: alvo.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro cartrack-scheduled-sync:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
