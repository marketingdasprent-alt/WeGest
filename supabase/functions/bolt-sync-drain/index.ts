import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { AuthorizationError, requireInternalRequest } from '../_shared/auth/edgeAuthorization.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const MAX_CONCORRENTE = 2;

interface LinhaFila {
  id: string;
  integracao_id: string;
  periodo_inicio: string;
  periodo_fim: string;
  formula_id: string | null;
  fase: string | null;
  semana_inicio: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  try {
    requireInternalRequest(req, SERVICE_ROLE_KEY);
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : 401;
    return new Response(
      JSON.stringify({ success: false, error: 'Chamada interna não autorizada' }),
      {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: reclamadas, error: erroClaim } = await supabase.rpc('bolt_sync_queue_claim', {
      p_max: MAX_CONCORRENTE,
    });
    if (erroClaim) throw erroClaim;

    const linhas = (reclamadas ?? []) as LinhaFila[];
    if (linhas.length === 0) {
      return json({ success: true, processadas: 0 });
    }

    const fechar = async (
      id: string,
      status: 'completed' | 'failed',
      resultado: unknown,
      erro?: string
    ) => {
      const { error } = await supabase
        .from('bolt_sync_queue')
        .update({
          status,
          completed_at: new Date().toISOString(),
          resultado: resultado ?? null,
          error_message: erro ?? null,
        })
        .eq('id', id);
      if (error) console.error(`[bolt-sync-drain] falha a fechar ${id}: ${error.message}`);
    };

    const resultados = await Promise.all(
      linhas.map(async (linha) => {
        try {
          if (linha.fase === 'agregar' && linha.semana_inicio) {
            const { count } = await supabase
              .from('bolt_sync_queue')
              .select('id', { count: 'exact', head: true })
              .eq('integracao_id', linha.integracao_id)
              .eq('semana_inicio', linha.semana_inicio)
              .eq('fase', 'viagens')
              .neq('status', 'completed');
            if ((count ?? 0) > 0) {
              await supabase
                .from('bolt_sync_queue')
                .update({ status: 'pending', started_at: null })
                .eq('id', linha.id);
              return { id: linha.id, adiado: true, dias_em_falta: count };
            }
          }

          const corpo: Record<string, unknown> = {
            integracao_id: linha.integracao_id,
            periodo_inicio: linha.periodo_inicio,
            periodo_fim: linha.periodo_fim,
          };
          if (linha.formula_id) corpo.formula_id = linha.formula_id;
          if (linha.fase && linha.fase !== 'completo') corpo.fase = linha.fase;
          if (linha.semana_inicio) corpo.semana_inicio = linha.semana_inicio;

          const resposta = await fetch(`${SUPABASE_URL}/functions/v1/bolt-sync-semana`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(corpo),
          });

          const dados = await resposta.json().catch(() => null);

          if (!resposta.ok || dados?.success === false) {
            await fechar(
              linha.id,
              'failed',
              dados,
              dados?.error || dados?.message || `HTTP ${resposta.status}`
            );
            return { id: linha.id, ok: false };
          }

          if (dados?.status === 'vazio') {
            await fechar(
              linha.id,
              'failed',
              dados,
              dados?.message || 'A API não devolveu viagens.'
            );
            return { id: linha.id, ok: false };
          }

          await fechar(linha.id, 'completed', dados);
          return { id: linha.id, ok: true };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await fechar(linha.id, 'failed', null, msg);
          return { id: linha.id, ok: false };
        }
      })
    );

    const ok = resultados.filter((r) => r.ok).length;
    console.log(
      `[bolt-sync-drain] processadas ${resultados.length} · ok ${ok} · falhadas ${resultados.length - ok}`
    );

    return json({
      success: true,
      processadas: resultados.length,
      concluidas: ok,
      falhadas: resultados.length - ok,
    });
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    console.error('[bolt-sync-drain] erro:', msg);
    return json({ success: false, error: msg }, 500);
  }
});
