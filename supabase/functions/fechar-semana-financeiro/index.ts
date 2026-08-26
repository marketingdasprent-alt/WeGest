// supabase/functions/fechar-semana-financeiro/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildWeeklyContractSummary } from '../_shared/resumo-semanal-viatura/calc.ts';
import { repartirDiasPorMotorista } from '../_shared/resumo-semanal-viatura/diasPorMotorista.ts';

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

    // ─── A que organização pertence este fecho ───────────────────────────
    // Até 2026-08-19 esta função não filtrava por organização nenhuma:
    // percorria `contratos_renting` inteira e escrevia resumos para toda a
    // gente. Quem carregasse em "Fechar Período" numa organização fechava o
    // período de TODAS — foi assim que a Década Ousada ficou com um fecho de
    // 10–16/08 que ninguém lá pediu (mesmo carimbo da Premium: 17/08 10:00:46).
    //
    // A função corre com service role, portanto ignora o RLS: o org_id tem de
    // ser resolvido e validado aqui à mão, a partir do JWT de quem chama.
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

    // org do corpo do pedido, ou a organização activa do utilizador
    let orgId: string | null =
      typeof body?.orgId === 'string' && body.orgId ? body.orgId : null;
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

    // Pertence mesmo a esta organização? (o orgId pode vir do corpo do pedido)
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
    // Limite EXCLUSIVO (dia seguinte) para as colunas `timestamptz`.
    //
    // `contratos_renting.data_inicio` e `contrato_condutores.data_inicio` são
    // timestamptz, e metade das linhas em produção tem hora (50,7% e 58,9%).
    // Um `.lte('data_inicio', '2026-08-16')` é coagido para
    // `2026-08-16 00:00:00+00`, portanto um contrato que começa às 14:00 do
    // último dia do período fica de fora do fecho, em silêncio.
    //
    // As restantes colunas de data usadas aqui — viatura_multas.data_infracao,
    // motorista_financeiro.data_movimento e os periodo_inicio/fim dos resumos
    // Bolt e Uber — são `date` e continuam com `.lte()` inclusivo, que é o
    // correcto para elas.
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
      // Sem isto o fecho atravessa organizações — ver a resolução do orgId acima.
      .eq('org_id', orgId)
      .is('deleted_at', null)
      // timestamptz → limite exclusivo, senão perde-se quem começa com hora
      // no último dia do período (ver o comentário acima).
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

    // Motoristas que já ficaram com bolt/uber/motorista_financeiro
    // contabilizados nesta corrida — ver comentário junto de
    // primeiraVezEsteMotoristaNaSemana, abaixo.
    const motoristasComTotaisSemana = new Set<string>();

    // ─── Quem conduz cada contrato, tudo de uma vez ──────────────────────
    // Era uma query por contrato dentro do ciclo. Passa para aqui porque o
    // livro de dias (a seguir) precisa de saber o motorista ANTES de repartir
    // os dias, e de caminho poupa uma ida à base por contrato.
    const condutorPorContrato = new Map<string, { motorista_id: string | null; cliente_id: string | null }>();
    if (todosContratos.length > 0) {
      const { data: condutores } = await supabase
        .from('contrato_condutores')
        .select('contrato_id, motorista_id, cliente_id, data_inicio')
        .in(
          'contrato_id',
          todosContratos.map((c) => c.id)
        )
        .eq('is_principal', true)
        // timestamptz — mesmo motivo do contrato: limite exclusivo.
        .lt('data_inicio', semanaFimExclusivoStr)
        .or(`data_fim.is.null,data_fim.gte.${semanaInicio}`)
        .order('data_inicio', { ascending: false });
      // Havendo mais do que um condutor principal a cobrir a semana (dados
      // ambíguos), fica o que começou mais tarde. Antes disto a query usava
      // .maybeSingle() e, nesse caso, devolvia erro e o contrato perdia o
      // motorista por completo.
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

    // ─── Um dia, um dono — e o dono é a PESSOA, não a viatura ────────────
    // O livro de dias era por viatura: um motorista com duas viaturas
    // atribuídas em simultâneo era cobrado 7 + 7 dias numa semana de 7.
    // A regra e os casos estão em _shared/resumo-semanal-viatura/diasPorMotorista.ts,
    // com testes — é a contraparte do buildSlotPeriodos do ecrã.
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
        if (!claim) continue; // 100% dos dias já reivindicados por versão mais recente com as mesmas datas.

        try {
          const { data: viatura } = await supabase
            .from('viaturas')
            .select('org_id, modelo_id')
            .eq('id', viaturaId)
            .maybeSingle();
          if (!viatura) continue;
          // Cinto e suspensórios: os contratos já vêm filtrados por org, mas a
          // viatura é lida por id e é dela que sai o org_id que se GRAVA nos
          // resumos. Se divergir, não se escreve nada na organização errada.
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
