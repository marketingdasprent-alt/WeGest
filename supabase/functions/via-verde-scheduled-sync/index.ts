import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Multi-tenant: percorre todas as integrações Via Verde com sync_automatico=true
// e dispara o robot-execute para cada uma. O cálculo do período (semana anterior)
// acontece dentro do robot-execute — esta função apenas orquestra.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: integracoes, error } = await supabase
      .from('plataformas_configuracao')
      .select('id, nome, org_id')
      .eq('plataforma', 'via_verde')
      .eq('ativo', true)
      .eq('sync_automatico', true);

    if (error) throw error;

    if (!integracoes || integracoes.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Nenhuma integração Via Verde com sync_automatico=true encontrada.',
          triggered: 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = await Promise.all(
      integracoes.map(async (int) => {
        try {
          const resp = await fetch(`${SUPABASE_URL}/functions/v1/robot-execute`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ integracao_id: int.id }),
          });
          const data = await resp.json();
          return {
            integracao_id: int.id,
            nome: int.nome,
            org_id: int.org_id,
            success: resp.ok && data?.success !== false,
            detail: data,
          };
        } catch (err) {
          return {
            integracao_id: int.id,
            nome: int.nome,
            org_id: int.org_id,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })
    );

    const triggered = results.filter((r) => r.success).length;
    const failed = results.length - triggered;

    return new Response(
      JSON.stringify({
        success: true,
        triggered,
        failed,
        total: results.length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('via-verde-scheduled-sync error:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
