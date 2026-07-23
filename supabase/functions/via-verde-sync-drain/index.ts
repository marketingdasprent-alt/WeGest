import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Capacidade atual do plano Apify dedicado do Via Verde — ajustar aqui se
// o plano mudar. Ver via_verde_sync_queue_claim (SQL) para a lógica de
// contagem/claim atómico que respeita este limite mesmo com invocações
// sobrepostas do cron.
const MAX_CONCURRENT = 2;

interface QueueItem {
  id: string;
  integracao_id: string;
  periodo_inicio: string | null;
  periodo_fim: string | null;
}

// Drena via_verde_sync_queue: reclama até MAX_CONCURRENT linhas pendentes
// (via RPC atómica) e dispara robot-execute para cada uma. Uma linha só
// fica "completed"/"failed" quando o robot-webhook recebe o callback real
// do Apify — aqui só se marca "failed" se o PRÓPRIO ARRANQUE falhar (a
// linha fica em "running" em caso de sucesso, à espera do webhook).
// Chamada a cada 5 min por cron (via-verde-sync-drain) e, opcionalmente,
// uma vez extra logo após um "Executar Robot" manual, para processar sem
// esperar pelo próximo tick.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: claimed, error: claimError } = await supabase.rpc('via_verde_sync_queue_claim', {
      p_max: MAX_CONCURRENT,
    });
    if (claimError) throw claimError;

    const items = (claimed || []) as QueueItem[];
    if (items.length === 0) {
      return new Response(JSON.stringify({ success: true, dispatched: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = await Promise.all(
      items.map(async (item) => {
        try {
          const body: Record<string, unknown> = { integracao_id: item.integracao_id };
          if (item.periodo_inicio) body.periodo_inicio = item.periodo_inicio;
          if (item.periodo_fim) body.periodo_fim = item.periodo_fim;

          const resp = await fetch(`${SUPABASE_URL}/functions/v1/robot-execute`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          });
          const data = await resp.json();

          if (!resp.ok || data?.success === false) {
            await supabase
              .from('via_verde_sync_queue')
              .update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                error_message: data?.error || `HTTP ${resp.status}`,
              })
              .eq('id', item.id);
            return { id: item.id, integracao_id: item.integracao_id, dispatched: false };
          }

          // Sucesso = Apify aceitou arrancar. A linha fica "running"; quem
          // fecha é o robot-webhook quando o scraping terminar de facto.
          return { id: item.id, integracao_id: item.integracao_id, dispatched: true };
        } catch (err) {
          await supabase
            .from('via_verde_sync_queue')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString(),
              error_message: err instanceof Error ? err.message : String(err),
            })
            .eq('id', item.id);
          return { id: item.id, integracao_id: item.integracao_id, dispatched: false };
        }
      })
    );

    return new Response(
      JSON.stringify({
        success: true,
        dispatched: results.filter((r) => r.dispatched).length,
        failed: results.filter((r) => !r.dispatched).length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('via-verde-sync-drain error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
