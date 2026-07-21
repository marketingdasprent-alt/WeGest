// supabase/functions/gerar-resumo-semanal-viaturas/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import { calcResumoSemanalViatura } from '../_shared/resumo-semanal-viatura/calc.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function toIsoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function diasEntre(inicio: Date, fim: Date): number {
  return Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / 86_400_000));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    // Semana fechada mais recente: a corrida de 2ª-feira 06:00 UTC processa
    // a semana que terminou ontem (domingo).
    const hoje = new Date();
    const semanaFimDate = new Date(hoje);
    semanaFimDate.setUTCDate(semanaFimDate.getUTCDate() - 1);
    const semanaInicioDate = new Date(semanaFimDate);
    semanaInicioDate.setUTCDate(semanaInicioDate.getUTCDate() - 6);
    const semanaInicio = toIsoDate(semanaInicioDate);
    const semanaFim = toIsoDate(semanaFimDate);

    // Contratos (qualquer regime) que se sobrepõem a esta semana.
    const { data: contratosSemana, error: contratosError } = await supabase
      .from('contratos_renting')
      .select(
        'id, org_id, viatura_id, regime, data_inicio, data_fim, tarifa_id, tarifa_diaria, valor_total_manual, estado_operacional'
      )
      .lte('data_inicio', semanaFim)
      .or(`data_fim.is.null,data_fim.gte.${semanaInicio}`);
    if (contratosError) throw contratosError;

    const viaturaIds = [
      ...new Set((contratosSemana ?? []).map((c) => c.viatura_id as string)),
    ];
    let processadas = 0;

    for (const viaturaId of viaturaIds) {
      try {
        const candidatos = (contratosSemana ?? []).filter((c) => c.viatura_id === viaturaId);
        // Critério: 1) 'em_curso' sobre 'agendado'; 2) entre iguais, quem tem
        // tarifa resolvível (tarifa_id/tarifa_diaria/valor_total_manual) —
        // evita apanhar uma reserva placeholder sem preço nenhum configurado.
        const temTarifa = (c: (typeof candidatos)[number]) =>
          !!c.tarifa_id || (Number(c.tarifa_diaria) || 0) > 0 || c.valor_total_manual != null;
        const contrato = [...candidatos].sort((a, b) => {
          if (a.estado_operacional !== b.estado_operacional) {
            return a.estado_operacional === 'em_curso' ? -1 : 1;
          }
          if (temTarifa(a) !== temTarifa(b)) return temTarifa(a) ? -1 : 1;
          return b.data_inicio.localeCompare(a.data_inicio);
        })[0];
        if (!contrato) continue;

        const { data: viatura } = await supabase
          .from('viaturas')
          .select('org_id, modelo_id')
          .eq('id', viaturaId)
          .maybeSingle();
        if (!viatura) continue;

        let valorSemanalTvde = 0;
        let tarifaDiariaRentACar = Number(contrato.tarifa_diaria) || 0;

        if (contrato.regime === 'tvde' && contrato.tarifa_id) {
          const { data: tarifa } = await supabase
            .from('renting_tarifas')
            .select('preco_semana')
            .eq('id', contrato.tarifa_id)
            .maybeSingle();
          valorSemanalTvde = Number(tarifa?.preco_semana ?? 0);

          if (!valorSemanalTvde && viatura.modelo_id) {
            const { data: precoModelo } = await supabase
              .from('renting_tarifa_precos_modelo')
              .select('preco_semana')
              .eq('tarifa_id', contrato.tarifa_id)
              .eq('modelo_id', viatura.modelo_id)
              .maybeSingle();
            valorSemanalTvde = Number(precoModelo?.preco_semana ?? 0);
          }
        }

        const dataInicioContrato = new Date(`${contrato.data_inicio.split('T')[0]}T00:00:00Z`);
        const dataFimContrato = contrato.data_fim
          ? new Date(`${contrato.data_fim.split('T')[0]}T00:00:00Z`)
          : new Date(`${semanaFim}T00:00:00Z`);
        const diasTotaisContrato = diasEntre(dataInicioContrato, dataFimContrato);

        const [multasRes, reparacoesRes] = await Promise.all([
          supabase
            .from('viatura_multas')
            .select('valor')
            .eq('viatura_id', viaturaId)
            .gte('data_infracao', semanaInicio)
            .lte('data_infracao', semanaFim),
          supabase
            .from('viatura_reparacoes')
            .select('custo, data_entrada, data_saida')
            .eq('viatura_id', viaturaId),
        ]);

        const totalMultas = (multasRes.data ?? []).reduce(
          (acc, r: { valor: number | null }) => acc + (Number(r.valor) || 0),
          0
        );

        const totalDanos = (reparacoesRes.data ?? [])
          .filter((r: { data_entrada: string | null; data_saida: string | null }) => {
            const dataRef = r.data_saida ?? r.data_entrada;
            return !!dataRef && dataRef >= semanaInicio && dataRef <= semanaFim;
          })
          .reduce((acc, r: { custo: number | null }) => acc + (Number(r.custo) || 0), 0);

        const resumo = calcResumoSemanalViatura({
          semanaInicio,
          semanaFim,
          contrato: {
            regime: contrato.regime === 'tvde' ? 'tvde' : 'rent_a_car',
            dataInicio: contrato.data_inicio.split('T')[0],
            dataFim: contrato.data_fim ? contrato.data_fim.split('T')[0] : null,
            valorSemanalTvde,
            tarifaDiariaRentACar,
            valorTotalManualRentACar:
              contrato.valor_total_manual != null ? Number(contrato.valor_total_manual) : null,
            diasTotaisContrato,
          },
          totalMultas,
          totalDanos,
        });

        const { error: upsertError } = await supabase.from('viatura_resumo_semanal').upsert(
          {
            org_id: viatura.org_id,
            viatura_id: viaturaId,
            semana_inicio: semanaInicio,
            semana_fim: semanaFim,
            receita_aluguer: resumo.receitaAluguer,
            receita_outros: 0,
            despesa_combustivel: 0,
            despesa_portagens: 0,
            despesa_danos: resumo.despesaDanos,
            despesa_outros: resumo.despesaMultas,
            gerado_em: new Date().toISOString(),
          },
          { onConflict: 'viatura_id,semana_inicio' }
        );
        if (upsertError) {
          console.error(`Falha ao gravar resumo da viatura ${viaturaId}:`, upsertError);
          continue;
        }
        processadas++;
      } catch (viaturaErr) {
        console.error(`Falha ao processar viatura ${viaturaId}:`, viaturaErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        semanaInicio,
        semanaFim,
        processadas,
        total: viaturaIds.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('gerar-resumo-semanal-viaturas error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
