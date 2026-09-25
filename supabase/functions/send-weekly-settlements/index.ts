import { RequestBodyError } from '../_shared/http/boundedJson.ts';
import {
  MAX_SETTLEMENTS_PER_BATCH,
  readWeeklyPeriod,
} from '../_shared/weekly-settlements/requestSchemas.ts';
import { AuthorizationError, requireInternalRequest } from '../_shared/auth/edgeAuthorization.ts';
// supabase/functions/send-weekly-settlements/index.ts
// Reativa o acerto de contas semanal (send-bulk-settlements, órfão desde
// sempre): lê o que fechar-semana-financeiro acabou de gravar em
// motorista_resumo_semanal e envia o resumo por email a cada motorista.
//
// Corre depois de fechar-semana-financeiro (mesmo dia, cron separado com
// alguns minutos de intervalo) — não altera esse função, só lê o
// resultado dela.
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import {
  buildSettlements,
  type ResumoSemanalRow,
  type MotoristaInfo,
} from '../_shared/weekly-settlements/buildSettlements.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function toIsoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatPeriodo(inicio: string, fim: string): string {
  const [yi, mi, di] = inicio.split('-');
  const [yf, mf, df] = fim.split('-');
  return yi === yf ? `${di}/${mi} a ${df}/${mf}/${yf}` : `${di}/${mi}/${yi} a ${df}/${mf}/${yf}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(null, { status: 405, headers: { ...corsHeaders, Allow: 'POST, OPTIONS' } });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    requireInternalRequest(req, serviceRoleKey);
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let { semanaInicio, semanaFim } = await readWeeklyPeriod(req);

    // Mesma janela por omissão de fechar-semana-financeiro: última semana
    // completa terminada ontem (o cron corre à segunda, a semana fechada é
    // segunda-a-domingo anterior).
    if (!semanaFim) {
      const ontem = new Date();
      ontem.setUTCDate(ontem.getUTCDate() - 1);
      semanaFim = toIsoDate(ontem);
    }
    if (!semanaInicio) {
      const inicio = new Date(semanaFim);
      inicio.setUTCDate(inicio.getUTCDate() - 6);
      semanaInicio = toIsoDate(inicio);
    }

    const interval = new Date(semanaFim).getTime() - new Date(semanaInicio).getTime();
    if (interval < 0 || interval > 6 * 24 * 60 * 60 * 1000) {
      throw new RequestBodyError('O período deve ter entre 1 e 7 dias');
    }
    const { data: resumoRows, error: resumoError } = await supabase
      .from('motorista_resumo_semanal')
      .select(
        'motorista_id, custo_aluguer, receita_bolt, receita_uber, receita_outras, despesa_caucao, despesa_seguros, despesa_outros'
      )
      .eq('semana_inicio', semanaInicio)
      .eq('semana_fim', semanaFim);

    if (resumoError) throw resumoError;

    if (!resumoRows || resumoRows.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          semanaInicio,
          semanaFim,
          enviados: 0,
          falhados: 0,
          mensagem: 'sem resumo semanal para este período',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const motoristaIds = [...new Set(resumoRows.map((r: ResumoSemanalRow) => r.motorista_id))];
    const { data: motoristas, error: motoristasError } = await supabase
      .from('motoristas_ativos')
      .select('id, nome, email')
      .in('id', motoristaIds);

    if (motoristasError) throw motoristasError;

    // O líquido que vai no email é o do resumo do motorista, tal como lhe foi
    // mostrado — nunca recalculado aqui. Ver buildSettlements.
    const { data: liquidos, error: liquidosError } = await supabase
      .from('motorista_liquido_semanal')
      .select('motorista_id, liquido')
      .eq('semana_inicio', semanaInicio)
      .in('motorista_id', motoristaIds);

    if (liquidosError) throw liquidosError;

    const liquidoPorMotorista = new Map<string, number>(
      (liquidos ?? []).map((l: { motorista_id: string; liquido: number }) => [
        l.motorista_id,
        Number(l.liquido),
      ])
    );

    const settlements = buildSettlements(
      resumoRows as ResumoSemanalRow[],
      (motoristas ?? []) as MotoristaInfo[],
      formatPeriodo(semanaInicio, semanaFim),
      liquidoPorMotorista
    );

    if (settlements.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          semanaInicio,
          semanaFim,
          enviados: 0,
          falhados: 0,
          mensagem: 'nenhum motorista com email e líquido do resumo gravado',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let enviados = 0;
    let falhados = 0;
    for (let offset = 0; offset < settlements.length; offset += MAX_SETTLEMENTS_PER_BATCH) {
      const batch = settlements.slice(offset, offset + MAX_SETTLEMENTS_PER_BATCH);
      const bulkResponse = await fetch(`${supabaseUrl}/functions/v1/send-bulk-settlements`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settlements: batch }),
      });
      if (!bulkResponse.ok) throw new Error('send-bulk-settlements falhou');
      const bulkResult: { results?: { success: boolean }[] } = await bulkResponse.json();
      enviados += (bulkResult.results ?? []).filter((result) => result.success).length;
      falhados += (bulkResult.results ?? []).filter((result) => !result.success).length;
    }
    return new Response(
      JSON.stringify({ success: true, semanaInicio, semanaFim, enviados, falhados }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof RequestBodyError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.error('send-weekly-settlements falhou:', error);
    return new Response(JSON.stringify({ error: 'Falha ao enviar acertos semanais' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
