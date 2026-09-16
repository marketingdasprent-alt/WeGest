import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { buildWeeklyContractSummary } from '../_shared/resumo-semanal-viatura/calc.ts';
import { repartirDiasPorMotorista } from '../_shared/resumo-semanal-viatura/diasPorMotorista.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function toIsoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function diasEntre(inicio: Date, fim: Date): number {
  return Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / 86_400_000) + 1);
}

interface ContratoRow {
  id: string;
  org_id: string;
  viatura_id: string;
  regime: string;
  data_inicio: string;
  data_fim: string | null;
  tarifa_id: string | null;
  tarifa_diaria: number | null;
  valor_total_manual: number | null;
  estado_operacional: string;
  versao: number;
  substituido_em: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    let semanaInicio: string;
    let semanaFim: string;

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error('Pedido sem autenticação.');
    }
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData } = await authClient.auth.getUser();
    const userId = authData?.user?.id ?? null;
    if (!userId) {
      throw new Error('Não foi possível identificar quem está a fechar o período.');
    }

    let orgId: string | null = typeof body?.orgId === 'string' && body.orgId ? body.orgId : null;
    if (!orgId) {
      const { data: ativa } = await supabase
        .from('user_org_ativa')
        .select('org_id')
        .eq('user_id', userId)
        .maybeSingle();
      orgId = (ativa as { org_id: string } | null)?.org_id ?? null;
    }
    if (!orgId) {
      throw new Error('Sem organização activa para fechar o período.');
    }

    const { data: membro } = await supabase
      .from('user_organizacoes')
      .select('org_id')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .maybeSingle();
    if (!membro) {
      throw new Error('Sem acesso a esta organização.');
    }
    if (body?.semanaInicio && body?.semanaFim) {
      const inicio = new Date(`${body.semanaInicio}T00:00:00Z`);
      const fim = new Date(`${body.semanaFim}T00:00:00Z`);
      if (fim < inicio) {
        throw new Error('semanaFim não pode ser anterior a semanaInicio');
      }
      semanaInicio = toIsoDate(inicio);
      semanaFim = toIsoDate(fim);
    } else if (body?.semanaInicio) {
      const inicio = new Date(`${body.semanaInicio}T00:00:00Z`);
      const fim = new Date(inicio);
      fim.setUTCDate(fim.getUTCDate() + 6);
      semanaInicio = toIsoDate(inicio);
      semanaFim = toIsoDate(fim);
    } else {
      const hoje = new Date();
      const semanaFimDate = new Date(hoje);
      semanaFimDate.setUTCDate(semanaFimDate.getUTCDate() - 1);
      const semanaInicioDate = new Date(semanaFimDate);
      semanaInicioDate.setUTCDate(semanaInicioDate.getUTCDate() - 6);
      semanaInicio = toIsoDate(semanaInicioDate);
      semanaFim = toIsoDate(semanaFimDate);
    }
    const hojeStr = toIsoDate(new Date());
    if (semanaInicio > hojeStr) {
      throw new Error('Não é possível fechar um período que ainda não começou.');
    }
    if (semanaFim > hojeStr) {
      semanaFim = hojeStr;
    }
    const weekStart = new Date(`${semanaInicio}T00:00:00Z`);
    const weekEnd = new Date(`${semanaFim}T00:00:00Z`);
    const semanaFimExclusivo = new Date(weekEnd);
    semanaFimExclusivo.setUTCDate(semanaFimExclusivo.getUTCDate() + 1);
    const semanaFimExclusivoStr = toIsoDate(semanaFimExclusivo);

    const { data: contratosSemana, error: contratosError } = await supabase
      .from('contratos_renting')
      .select(
        'id, org_id, viatura_id, regime, data_inicio, data_fim, tarifa_id, tarifa_diaria, valor_total_manual, estado_operacional, versao, substituido_em'
      )
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .lt('data_inicio', semanaFimExclusivoStr)
      .or(`data_fim.is.null,data_fim.gte.${semanaInicio}`)
      .or('estado_operacional.neq.cancelado,substituido_em.not.is.null');
    if (contratosError) throw contratosError;

    const todosContratos = (contratosSemana ?? []) as ContratoRow[];
    const viaturaIds = [...new Set(todosContratos.map((c) => c.viatura_id))];
    let viaturasAtualizadas = 0;
    let motoristasAtualizados = 0;

    const receitaPorViatura = new Map<
      string,
      { orgId: string; receitaAluguer: number; despesaDanos: number; despesaOutros: number }
    >();

    const motoristasComTotaisSemana = new Set<string>();

    const condutorPorContrato = new Map<
      string,
      { motorista_id: string | null; cliente_id: string | null }
    >();
    if (todosContratos.length > 0) {
      const { data: condutores } = await supabase
        .from('contrato_condutores')
        .select('contrato_id, motorista_id, cliente_id, data_inicio')
        .in(
          'contrato_id',
          todosContratos.map((c) => c.id)
        )
        .eq('is_principal', true)
        .lt('data_inicio', semanaFimExclusivoStr)
        .or(`data_fim.is.null,data_fim.gte.${semanaInicio}`)
        .order('data_inicio', { ascending: false });
      for (const cc of (condutores ?? []) as Array<{
        contrato_id: string;
        motorista_id: string | null;
        cliente_id: string | null;
      }>) {
        if (!condutorPorContrato.has(cc.contrato_id)) {
          condutorPorContrato.set(cc.contrato_id, {
            motorista_id: cc.motorista_id ?? null,
            cliente_id: cc.cliente_id ?? null,
          });
        }
      }
    }

    const claims = repartirDiasPorMotorista(
      todosContratos,
      (contratoId) => condutorPorContrato.get(contratoId)?.motorista_id ?? null,
      weekStart,
      weekEnd
    );

    for (const viaturaId of viaturaIds) {
      const candidatos = todosContratos.filter((c) => c.viatura_id === viaturaId);

      for (const contrato of candidatos) {
        const claim = claims.get(contrato.id);
        if (!claim) continue;

        try {
          const { data: viatura } = await supabase
            .from('viaturas')
            .select('org_id, modelo_id')
            .eq('id', viaturaId)
            .maybeSingle();
          if (!viatura) continue;
          if (viatura.org_id !== orgId) continue;

          const condutorRow = condutorPorContrato.get(contrato.id) ?? null;

          let valorSemanalTvde = 0;
          const tarifaDiariaRentACar = Number(contrato.tarifa_diaria) || 0;

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

          const dataInicioContratoOriginal = new Date(
            `${contrato.data_inicio.split('T')[0]}T00:00:00Z`
          );
          const dataFimContratoOriginal = contrato.data_fim
            ? new Date(`${contrato.data_fim.split('T')[0]}T00:00:00Z`)
            : new Date(`${semanaFim}T00:00:00Z`);
          const diasTotaisContrato = diasEntre(dataInicioContratoOriginal, dataFimContratoOriginal);

          const motoristaId = condutorRow?.motorista_id ?? null;
          const primeiraVezEsteMotoristaNaSemana =
            !motoristaId || !motoristasComTotaisSemana.has(motoristaId);

          const [multasRes, reparacoesRes, financeiroRes, boltRes, uberRes] = await Promise.all([
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
            motoristaId
              ? supabase
                  .from('motorista_financeiro')
                  .select('tipo, categoria, valor')
                  .eq('motorista_id', motoristaId)
                  .gte('data_movimento', semanaInicio)
                  .lte('data_movimento', semanaFim)
                  .neq('status', 'cancelado')
              : Promise.resolve({
                  data: [] as { tipo: string; categoria: string | null; valor: number }[],
                }),
            motoristaId
              ? supabase
                  .from('bolt_resumos_semanais')
                  .select('liquido_a_pagar, periodo_inicio, periodo_fim')
                  .eq('motorista_id', motoristaId)
                  .lte('periodo_inicio', semanaFim)
                  .gte('periodo_fim', semanaInicio)
              : Promise.resolve({ data: [] as { liquido_a_pagar: number | null }[] }),
            motoristaId
              ? supabase
                  .from('uber_resumos_semanais')
                  .select('ganhos_brutos, periodo_inicio, periodo_fim')
                  .eq('motorista_id', motoristaId)
                  .lte('periodo_inicio', semanaFim)
                  .gte('periodo_fim', semanaInicio)
              : Promise.resolve({ data: [] as { ganhos_brutos: number | null }[] }),
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
          const boltTotal = (boltRes.data ?? []).reduce(
            (acc, r: { liquido_a_pagar: number | null }) => acc + (Number(r.liquido_a_pagar) || 0),
            0
          );
          const uberTotal = (uberRes.data ?? []).reduce(
            (acc, r: { ganhos_brutos: number | null }) => acc + (Number(r.ganhos_brutos) || 0),
            0
          );

          const summary = buildWeeklyContractSummary({
            semanaInicio,
            semanaFim,
            contrato: {
              regime: contrato.regime === 'tvde' ? 'tvde' : 'rent_a_car',
              dataInicio: claim.inicio,
              dataFim: claim.fim,
              valorSemanalTvde,
              tarifaDiariaRentACar,
              valorTotalManualRentACar:
                contrato.valor_total_manual != null ? Number(contrato.valor_total_manual) : null,
              diasTotaisContrato,
            },
            condutor: { motoristaId, clienteId: condutorRow?.cliente_id ?? null },
            motoristaFinanceiro: primeiraVezEsteMotoristaNaSemana
              ? (financeiroRes.data ?? []).map((f) => ({
                  tipo: f.tipo as 'credito' | 'debito',
                  categoria: f.categoria,
                  valor: Number(f.valor) || 0,
                }))
              : [],
            boltUber: {
              bolt: primeiraVezEsteMotoristaNaSemana ? boltTotal : 0,
              uber: primeiraVezEsteMotoristaNaSemana ? uberTotal : 0,
            },
            totalMultas,
            totalDanos,
          });

          const acumulado = receitaPorViatura.get(viaturaId) ?? {
            orgId: viatura.org_id,
            receitaAluguer: 0,
            despesaDanos: 0,
            despesaOutros: 0,
          };
          acumulado.receitaAluguer += summary.receitaViatura.receitaAluguer;
          acumulado.despesaDanos = summary.receitaViatura.despesaDanos;
          acumulado.despesaOutros = summary.receitaViatura.despesaMultas;
          receitaPorViatura.set(viaturaId, acumulado);

          if (summary.custoMotorista && motoristaId) {
            const { error: motoristaUpsertError } = await supabase
              .from('motorista_resumo_semanal')
              .upsert(
                {
                  org_id: viatura.org_id,
                  motorista_id: motoristaId,
                  contrato_id: contrato.id,
                  viatura_id: viaturaId,
                  semana_inicio: semanaInicio,
                  semana_fim: semanaFim,
                  custo_aluguer: summary.custoMotorista.custoAluguer,
                  receita_bolt: summary.custoMotorista.receitaBolt,
                  receita_uber: summary.custoMotorista.receitaUber,
                  receita_outras: summary.custoMotorista.receitaOutras,
                  despesa_caucao: summary.custoMotorista.despesaCaucao,
                  despesa_seguros: summary.custoMotorista.despesaSeguros,
                  despesa_outros: summary.custoMotorista.despesaOutros,
                  gerado_em: new Date().toISOString(),
                },
                { onConflict: 'motorista_id,contrato_id,semana_inicio,semana_fim' }
              );
            if (!motoristaUpsertError) {
              motoristasAtualizados++;
              motoristasComTotaisSemana.add(motoristaId);
            } else
              console.error(
                `Falha ao gravar resumo do motorista ${motoristaId}:`,
                motoristaUpsertError
              );
          }
        } catch (contratoErr) {
          console.error(`Falha ao processar contrato ${contrato.id}:`, contratoErr);
        }
      }
    }

    for (const [viaturaId, acumulado] of receitaPorViatura) {
      const { error: viaturaUpsertError } = await supabase.from('viatura_resumo_semanal').upsert(
        {
          org_id: acumulado.orgId,
          viatura_id: viaturaId,
          semana_inicio: semanaInicio,
          semana_fim: semanaFim,
          receita_aluguer: acumulado.receitaAluguer,
          receita_outros: 0,
          despesa_combustivel: 0,
          despesa_portagens: 0,
          despesa_danos: acumulado.despesaDanos,
          despesa_outros: acumulado.despesaOutros,
          gerado_em: new Date().toISOString(),
        },
        { onConflict: 'viatura_id,semana_inicio,semana_fim' }
      );
      if (!viaturaUpsertError) viaturasAtualizadas++;
      else console.error(`Falha ao gravar resumo da viatura ${viaturaId}:`, viaturaUpsertError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        orgId,
        semanaInicio,
        semanaFim,
        viaturasAtualizadas,
        motoristasAtualizados,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('fechar-semana-financeiro error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
