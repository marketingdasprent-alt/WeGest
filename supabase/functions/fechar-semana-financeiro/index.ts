// supabase/functions/fechar-semana-financeiro/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildWeeklyContractSummary } from '../_shared/resumo-semanal-viatura/calc.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function toIsoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

// Inclusivo (mesma convenção de diffDiasInclusive em calc.ts) — um contrato
// de 30 dias corridos toca 31 datas de calendário; usar Math.ceil sem +1
// sub-rateava o valor_total_manual do rent-a-car por ~3% a mais por semana.
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

/**
 * Um contrato pode ter várias linhas em `contratos_renting` para a mesma
 * viatura na mesma semana: versionamento (edição/renovação, substituido_em
 * setado no antigo), ou reservas placeholder nunca por diante. Duas linhas
 * podem ter datas IDÊNTICAS (edição administrativa sem mudar o período —
 * nesse caso só a mais recente conta) ou datas DIFERENTES/adjacentes
 * (renovação real — as duas contam, cada uma pelos seus próprios dias).
 *
 * Em vez de somar todos os contratos que se sobrepõem à semana (o que
 * duplica no caso das datas idênticas), atribuímos cada DIA da semana a no
 * máximo um contrato: o de maior prioridade (versão ainda não substituída
 * primeiro, depois `versao` mais alta) entre os que cobrem esse dia. Um
 * contrato cujos dias foram todos "roubados" por uma versão mais recente
 * com as mesmas datas fica com 0 dias reivindicados e não conta nada.
 */
function reivindicarDiasPorContrato(
  candidatos: ContratoRow[],
  weekStart: Date,
  weekEnd: Date
): Map<string, { inicio: string; fim: string; dias: number }> {
  const ordenados = [...candidatos].sort((a, b) => {
    const aVivo = a.substituido_em == null;
    const bVivo = b.substituido_em == null;
    if (aVivo !== bVivo) return aVivo ? -1 : 1;
    return (b.versao ?? 0) - (a.versao ?? 0);
  });

  const diasReivindicados = new Set<string>();
  const resultado = new Map<string, { inicio: string; fim: string; dias: number }>();

  for (const c of ordenados) {
    const cInicio = new Date(`${c.data_inicio.split('T')[0]}T00:00:00Z`);
    const cFim = c.data_fim ? new Date(`${c.data_fim.split('T')[0]}T00:00:00Z`) : weekEnd;
    const overlapInicio = cInicio > weekStart ? cInicio : weekStart;
    const overlapFim = cFim < weekEnd ? cFim : weekEnd;
    if (overlapInicio > overlapFim) continue;

    const diasLivres: string[] = [];
    for (
      let d = new Date(overlapInicio);
      d.getTime() <= overlapFim.getTime();
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const iso = toIsoDate(d);
      if (!diasReivindicados.has(iso)) {
        diasLivres.push(iso);
        diasReivindicados.add(iso);
      }
    }
    if (diasLivres.length > 0) {
      diasLivres.sort();
      resultado.set(c.id, {
        inicio: diasLivres[0],
        fim: diasLivres[diasLivres.length - 1],
        dias: diasLivres.length,
      });
    }
  }

  return resultado;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    let semanaInicio: string;
    let semanaFim: string;

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    if (body?.semanaInicio && body?.semanaFim) {
      // Período explícito (UI "Fechar Semana" com range custom) — usado tal
      // como veio, sem forçar semana civil de 7 dias.
      const inicio = new Date(`${body.semanaInicio}T00:00:00Z`);
      const fim = new Date(`${body.semanaFim}T00:00:00Z`);
      if (fim < inicio) {
        throw new Error('semanaFim não pode ser anterior a semanaInicio');
      }
      semanaInicio = toIsoDate(inicio);
      semanaFim = toIsoDate(fim);
    } else if (body?.semanaInicio) {
      // Legado: só início → assume semana civil completa (7 dias).
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
    // Não dá pra fechar um período que ainda não aconteceu (contrato/multas/
    // reparações desse futuro simplesmente não existem ainda) — clamp a
    // hoje ANTES de derivar weekStart/weekEnd, para que toda a query e o
    // cálculo já usem a data clampada.
    const hojeStr = toIsoDate(new Date());
    if (semanaInicio > hojeStr) {
      throw new Error('Não é possível fechar um período que ainda não começou.');
    }
    if (semanaFim > hojeStr) {
      semanaFim = hojeStr;
    }
    const weekStart = new Date(`${semanaInicio}T00:00:00Z`);
    const weekEnd = new Date(`${semanaFim}T00:00:00Z`);
    // Limite exclusivo (dia seguinte) para colunas timestamptz como
    // uber_transactions.occurred_at — um `.lte(semanaFim)` com string de
    // data pura seria coagido para meia-noite de domingo, perdendo o
    // domingo inteiro.
    const semanaFimExclusivo = new Date(weekEnd);
    semanaFimExclusivo.setUTCDate(semanaFimExclusivo.getUTCDate() + 1);
    const semanaFimExclusivoStr = toIsoDate(semanaFimExclusivo);

    // Exclui: linhas apagadas (deleted_at) e contratos genuinamente
    // cancelados sem nunca terem sido substituídos por uma versão nova
    // (substituido_em IS NULL) — esses nunca chegaram a acontecer. Um
    // contrato cancelado QUE FOI substituído (substituido_em setado) fica
    // incluído: pode ter dias reais antes da renovação/edição que o
    // substituiu, resolvidos por reivindicarDiasPorContrato() abaixo.
    const { data: contratosSemana, error: contratosError } = await supabase
      .from('contratos_renting')
      .select(
        'id, org_id, viatura_id, regime, data_inicio, data_fim, tarifa_id, tarifa_diaria, valor_total_manual, estado_operacional, versao, substituido_em'
      )
      .is('deleted_at', null)
      .lte('data_inicio', semanaFim)
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

    // Motoristas que já ficaram com bolt/uber/motorista_financeiro
    // contabilizados nesta corrida — ver comentário junto de
    // primeiraVezEsteMotoristaNaSemana, abaixo.
    const motoristasComTotaisSemana = new Set<string>();

    for (const viaturaId of viaturaIds) {
      const candidatos = todosContratos.filter((c) => c.viatura_id === viaturaId);
      const claims = reivindicarDiasPorContrato(candidatos, weekStart, weekEnd);

      for (const contrato of candidatos) {
        const claim = claims.get(contrato.id);
        if (!claim) continue; // 100% dos dias já reivindicados por versão mais recente com as mesmas datas.

        try {
          const { data: viatura } = await supabase
            .from('viaturas')
            .select('org_id, modelo_id')
            .eq('id', viaturaId)
            .maybeSingle();
          if (!viatura) continue;

          const { data: condutorRow } = await supabase
            .from('contrato_condutores')
            .select('motorista_id, cliente_id')
            .eq('contrato_id', contrato.id)
            .eq('is_principal', true)
            .lte('data_inicio', semanaFim)
            .or(`data_fim.is.null,data_fim.gte.${semanaInicio}`)
            .maybeSingle();

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

          // diasTotaisContrato usa as datas ORIGINAIS do contrato (não os
          // dias reivindicados desta semana) — serve só para ratear o
          // valor_total_manual do rent-a-car pela duração inteira do
          // contrato, não pela fatia desta semana.
          const dataInicioContratoOriginal = new Date(
            `${contrato.data_inicio.split('T')[0]}T00:00:00Z`
          );
          const dataFimContratoOriginal = contrato.data_fim
            ? new Date(`${contrato.data_fim.split('T')[0]}T00:00:00Z`)
            : new Date(`${semanaFim}T00:00:00Z`);
          const diasTotaisContrato = diasEntre(dataInicioContratoOriginal, dataFimContratoOriginal);

          const motoristaId = condutorRow?.motorista_id ?? null;
          // bolt/uber/motorista_financeiro são consultados por motorista_id +
          // semana inteira (não por contrato) — se o mesmo motorista aparece
          // em 2+ segmentos nesta semana (renovação/troca a meio), cada
          // segmento veria o MESMO total da semana. custo_aluguer deve
          // continuar por segmento (é isso que se está a corrigir), mas os
          // restantes campos só podem ser atribuídos a um segmento, senão
          // duplicam quando useMotoristaResumoSemanal.ts soma os segmentos.
          // Só marca como "já contabilizado" depois de o upsert deste
          // segmento ter sucesso (abaixo) — se este segmento falhar antes
          // disso, o próximo segmento do mesmo motorista ainda pode levar
          // os totais da semana, em vez de ficarem perdidos.
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
            // Bolt: o MESMO campo que o ecrã de resumos e a ficha do motorista
            // mostram — ganhos_liquidos, escrito tanto pela API oficial como
            // pelo CSV. Lia-se aqui ganhos_brutos_total, o BRUTO: o painel do
            // motorista mostrava um número e os outros dois ecrãs mostravam
            // outro. Em 178 semanas fechadas, 178 não batiam — 65.087,40 EUR no
            // painel contra 47.730,63 EUR nos restantes.
            motoristaId
              ? supabase
                  .from('bolt_resumos_semanais')
                  .select('ganhos_liquidos, periodo_inicio, periodo_fim')
                  .eq('motorista_id', motoristaId)
                  .lte('periodo_inicio', semanaFim)
                  .gte('periodo_fim', semanaInicio)
              : Promise.resolve({ data: [] as { ganhos_liquidos: number | null }[] }),
            // Uber: o resumo semanal, igual à Bolt. Somava-se aqui
            // uber_transactions em bruto, o que duplicava a receita no dia em
            // que a API oficial ligasse (uma linha por VIAGEM da API mais a
            // linha SEMANAL do CSV, na mesma soma). O resumo é mantido por
            // gatilho e já resolve a precedência. Ver 20260814170000.
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
            (acc, r: { ganhos_liquidos: number | null }) => acc + (Number(r.ganhos_liquidos) || 0),
            0
          );
          const uberTotal = (uberRes.data ?? []).reduce(
            (acc, r: { ganhos_brutos: number | null }) => acc + (Number(r.ganhos_brutos) || 0),
            0
          );

          // Passa ao cálculo puro só o intervalo de dias REIVINDICADO por
          // este contrato nesta semana (claim.inicio/claim.fim), não as
          // datas originais do contrato — é isto que impede a duplicação
          // quando duas versões do mesmo contrato se sobrepõem.
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
            // Só o primeiro segmento do motorista nesta semana leva os
            // valores semana-inteira (bolt/uber/financeiro) — os restantes
            // ficam a 0 nestes campos para não duplicar quando o hook de
            // leitura soma os segmentos. custo_aluguer (abaixo, via
            // summary.custoMotorista.custoAluguer) continua correto por
            // segmento, porque vem só de claim.inicio/claim.fim.
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
          // despesaDanos e despesaOutros (multas) são atribuídos, não
          // somados: totalDanos/totalMultas vêm de queries filtradas só por
          // viatura_id + semana (não por contrato), logo repetem o mesmo
          // total em cada iteração da mesma viatura — somar duplicaria.
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
      JSON.stringify({ success: true, semanaInicio, semanaFim, viaturasAtualizadas, motoristasAtualizados }),
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
