import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  BoltApiError,
  type BoltCredenciais,
  type FleetOrder,
  limparCacheTokens,
  listarEmpresas,
  paginar,
} from '../_shared/bolt/client.ts';
import {
  agregarPorMotorista,
  DIVISOR_DISTANCIA_POR_DEFEITO,
  eFormulaId,
  FORMULA_POR_DEFEITO,
  FORMULAS,
  type FormulaId,
  type LinhaAgregada,
} from '../_shared/bolt/agregar.ts';
import {
  analisarData,
  formatarData,
  type Semana,
  segundaDaSemana,
  semanaEntre,
  semanaPassada,
  somarDias,
} from '../_shared/bolt/semana.ts';
import {
  construirChaveMotorista,
  criarMatcherMotoristas,
  type MotoristaConhecido,
} from '../_shared/bolt-import-csv/parse.ts';

/**
 * bolt-sync-semana — traz UMA semana de UMA integração da API de frota da Bolt
 * e grava-a em bolt_resumos_semanais (por motorista) e bolt_viagens (por viagem).
 *
 * Contrato:
 *   POST { integracao_id, periodo_inicio?, periodo_fim?, filtro_temporal?,
 *          formula_id?, company_id? }
 * Sem datas assume a semana passada (2ª a Dom) em Europe/Lisbon.
 *
 * AS TRÊS REGRAS QUE NÃO SE NEGOCEIAM:
 *
 * 1. A escrita do resumo passa SEMPRE pela RPC bolt_resumo_merge_api, nunca por
 *    um upsert directo. A RPC é que garante a propriedade por campo: a API é
 *    dona das viagens, o CSV é dono de ganhos_campanha e reembolsos_despesas, e
 *    ganhos_brutos_total é recalculado da soma. Um upsert directo daqui apagava
 *    as campanhas importadas por CSV — e as campanhas não existem em lado nenhum
 *    da API, portanto era uma perda definitiva.
 *
 * 2. Uma corrida com ZERO viagens não escreve nada em bolt_resumos_semanais. Um
 *    período vazio pode ser um erro de datas, uma empresa inactiva ou uma
 *    credencial trocada; escrever zeros por cima de uma semana boa é destruir
 *    dados por causa de um engano. Fica registado como 'vazio' no log.
 *
 * 3. bolt_viagens.driver_earnings e total_price ficam a NULL de propósito. São
 *    colunas legadas que o ContasResumoTab (.gt('driver_earnings', 0)) e o
 *    MotoristaRecibosSection lêem; preenchê-las agora fazia a receita Bolt
 *    aparecer a dobrar, porque o financeiro ainda soma o CSV
 *    (BOLT_FONTE_FINANCEIRA === 'csv'). O valor da API vive em net_earnings e
 *    ride_price. A troca de fonte faz-se em src/config/bolt.ts, num sítio só.
 *
 * PRIVACIDADE: as respostas da Bolt trazem moradas e telefones. Nada do corpo
 * vai para console.log — só contagens, códigos e totais.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const jsonError = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  json({ success: false, status: 'error', error, ...extra }, status);

/** Estado como fica em bolt_sync_logs.status. */
type EstadoSync = 'success' | 'warning' | 'vazio' | 'error';

const TIPO_LOG = 'api_sync';

/** Página do getFleetOrders. O tecto da Bolt é 1000; 500 é o meio-termo seguro. */
const LIMITE_PAGINA = 500;

/** Linhas por upsert em bolt_viagens. */
const LOTE_VIAGENS = 500;

/** Um pedido só pode cobrir isto — trava enganos do tipo "sincroniza 2026 todo". */
const MAX_DIAS_PERIODO = 62;

type FiltroTemporal = 'created' | 'price_review';
const FILTROS_TEMPORAIS: FiltroTemporal[] = ['created', 'price_review'];

/**
 * 'created' = filtra pela data de criação da viagem, que é o que corresponde à
 * semana do relatório do portal. 'price_review' existe para conferir semanas em
 * que a Bolt reviu preços depois do fecho.
 */
const FILTRO_POR_DEFEITO: FiltroTemporal = 'created';

/**
 * Erros que dizem "a base de dados ainda não tem o que esta função precisa".
 * Não vale a pena repetir a chamada para os 200 motoristas seguintes: o
 * resultado é o mesmo e o log fica ilegível.
 */
function erroEstrutural(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  const codigo = erro.code ?? '';
  if (['PGRST202', 'PGRST204', '42883', '42P01', '42703', '42P10'].includes(codigo)) return true;
  return /bolt_resumo_merge_api|chave_motorista|bolt_normalizar_nome|migra[çc]/i.test(
    erro.message ?? '',
  );
}

/**
 * Colisão com a constraint LEGADA
 * UNIQUE(integracao_id, periodo, identificador_motorista).
 *
 * Acontece quando a linha do CSV foi escrita pela versão ANTIGA do
 * bolt-import-csv, que não preenche chave_motorista. O ON CONFLICT da RPC
 * arbitra pelo índice novo (…, chave_motorista); como a linha antiga tem essa
 * coluna a NULL — e em Postgres dois NULL nunca colidem — não a encontra, tenta
 * INSERIR, e é a constraint antiga que a apanha, porque o identificador_motorista
 * é o mesmo. Falha para TODOS os motoristas da semana, não só para um.
 *
 * Não se corrige daqui: ou se faz o deploy do bolt-import-csv novo e se
 * reimporta a semana, ou se preenche chave_motorista nessas linhas. Abortar à
 * primeira, com o motivo certo, evita 200 erros iguais no log.
 */
function erroChaveLegada(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  if (erro.code !== '23505') return false;
  return /identificador_m|chave_unica|bolt_resumos_semanais/i.test(erro.message ?? '');
}

/** Colunas de bolt_viagens que só existem depois da migração das parcelas. */
function faltaColunaViagens(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  if (erro.code === '42703' || erro.code === 'PGRST204') return true;
  return /column .* does not exist|could not find the .* column/i.test(erro.message ?? '');
}

function segundosParaIso(segundos?: number | null): string | null {
  if (typeof segundos !== 'number' || !Number.isFinite(segundos) || segundos <= 0) return null;
  return new Date(segundos * 1000).toISOString();
}

const euros = (valor: number) =>
  `${valor.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;

/** Traduz um erro da Bolt para uma frase que diga ao utilizador o que fazer. */
function explicarErroBolt(erro: unknown): string {
  if (erro instanceof BoltApiError) {
    switch (erro.codigo) {
      case 498810:
        return 'A Bolt recusou o acesso a esta empresa (COMPANY_NOT_ALLOWED). ' +
          'Confirme o Company ID da integração ou peça à Bolt para associar a frota a estas credenciais.';
      case 498809:
        return 'A empresa está inactiva na Bolt (COMPANY_NOT_ACTIVE). A sincronização só funciona depois de a Bolt a reactivar.';
      case 498805:
      case 498806:
        return `A Bolt recusou o intervalo de datas (${erro.codigoNome ?? erro.codigo}): ${erro.message}`;
      case 702:
        return `A Bolt rejeitou o pedido como inválido (INVALID_REQUEST): ${erro.message}`;
      default:
        return erro.message;
    }
  }
  return erro instanceof Error ? erro.message : String(erro);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const inicioMs = Date.now();

  // Preenchido assim que a org for conhecida, para que uma excepção a meio
  // também deixe rasto em bolt_sync_logs.
  let logDeEmergencia: ((mensagem: string) => Promise<void>) | null = null;
  let clientIdEmUso: string | null = null;

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ── Auth: os mesmos 2 chamadores do bolt-import-csv ──
    // 1) service-role (agendador/robot): confia no integracao_id.
    // 2) utilizador autenticado: tem de ser admin DA ORG dona da integração.
    //    O papel de admin é por-org (user_organizacoes); o flag global de
    //    profiles dava 403 errado a utilizadores multi-org.
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '');
    const isRobotCall = bearerToken === SERVICE_ROLE_KEY;

    let callerUserId: string | null = null;
    if (!isRobotCall) {
      if (!bearerToken) return jsonError('Não autenticado.', 401);
      const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authErr } = await anonClient.auth.getUser();
      if (authErr || !user) return jsonError('Sessão inválida.', 401);
      callerUserId = user.id;
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return jsonError('Corpo do pedido inválido (JSON esperado).', 400);
    }

    const {
      integracao_id,
      periodo_inicio,
      periodo_fim,
      filtro_temporal,
      formula_id,
      company_id: companyIdPedido,
    } = body as Record<string, unknown>;

    if (!integracao_id || typeof integracao_id !== 'string') {
      return jsonError('integracao_id é obrigatório.', 400);
    }

    // ── 1. Configuração da integração ──
    const { data: config, error: erroConfig } = await supabase
      .from('plataformas_configuracao')
      .select(
        'id, nome, org_id, plataforma, robot_target_platform, auth_mode, client_id, client_secret, company_id, ativo',
      )
      .eq('id', integracao_id)
      .maybeSingle();

    if (erroConfig) return jsonError(`Falha a ler a integração: ${erroConfig.message}`, 500);
    if (!config) return jsonError('Integração não encontrada.', 404);

    if (callerUserId) {
      const { data: membership } = await supabase
        .from('user_organizacoes')
        .select('is_admin')
        .eq('user_id', callerUserId)
        .eq('org_id', config.org_id)
        .maybeSingle();
      if (!membership?.is_admin) {
        return jsonError('Sem permissão de administrador nesta organização.', 403);
      }
    }

    const orgId = config.org_id as string | null;
    if (!orgId) {
      return jsonError(
        `A integração "${config.nome}" não tem organização associada — sem org_id as linhas ficariam invisíveis por RLS.`,
        409,
      );
    }

    // ── Log: chamado em TODOS os caminhos de saída, incluindo o vazio ──
    // org_id explícito de propósito: o default da coluna é get_current_org_id(),
    // que sob service-role devolve NULL, e o log ficava invisível para a org.
    const registarLog = async (
      status: EstadoSync,
      mensagem: string,
      detalhes: Record<string, unknown> = {},
    ) => {
      const { error } = await supabase.from('bolt_sync_logs').insert({
        org_id: orgId,
        integracao_id,
        tipo: TIPO_LOG,
        status,
        mensagem,
        viagens_novas: Number(detalhes.viagens_gravadas ?? 0),
        viagens_atualizadas: Number(detalhes.resumos_gravados ?? 0),
        erros: Number(detalhes.erros ?? 0),
        executado_por: callerUserId,
        detalhes,
      });
      if (error) {
        console.error(`[bolt-sync-semana] falha a gravar em bolt_sync_logs: ${error.message}`);
      }
    };

    logDeEmergencia = (mensagem: string) => registarLog('error', mensagem, { erros: 1 });

    // ── 2. A integração é mesmo Bolt e está em modo OAuth? ──
    const ehBolt = config.plataforma === 'bolt' || config.robot_target_platform === 'bolt';
    if (!ehBolt) {
      return jsonError(
        `A integração "${config.nome}" não é da Bolt (plataforma="${config.plataforma}", ` +
          `robot_target_platform="${config.robot_target_platform ?? 'null'}").`,
        400,
      );
    }

    if (config.auth_mode !== 'oauth') {
      const mensagem =
        `A integração "${config.nome}" está em auth_mode="${config.auth_mode ?? 'null'}" e esta função ` +
        'só sabe falar com a API oficial da Bolt (auth_mode="oauth"). ' +
        'Para a converter: mude auth_mode para "oauth" e ponha em client_id/client_secret as ' +
        'credenciais Fleet Integration do portal Bolt (o Client ID é uma chave, não o email de login). ' +
        'Enquanto estiver assim, continue a usar a importação por CSV.';
      await registarLog('error', mensagem, { erros: 1, auth_mode: config.auth_mode });
      return jsonError(mensagem, 409);
    }

    const clientId = (config.client_id ?? '').trim();
    const clientSecret = (config.client_secret ?? '').trim();
    if (!clientId || !clientSecret) {
      const mensagem =
        `A integração "${config.nome}" está em modo oauth mas não tem client_id e/ou client_secret.`;
      await registarLog('error', mensagem, { erros: 1 });
      return jsonError(mensagem, 409);
    }
    const cred: BoltCredenciais = { clientId, clientSecret };
    clientIdEmUso = clientId;

    // ── 3. Período (fronteiras em Europe/Lisbon, nunca em UTC) ──
    let semana: Semana;
    if (periodo_inicio || periodo_fim) {
      if (periodo_inicio && periodo_fim) {
        const inicio = analisarData(periodo_inicio);
        const fim = analisarData(periodo_fim);
        if (!inicio || !fim) {
          return jsonError('periodo_inicio/periodo_fim têm de ser datas no formato YYYY-MM-DD.', 400);
        }
        if (formatarData(fim) < formatarData(inicio)) {
          return jsonError('periodo_fim é anterior a periodo_inicio.', 400);
        }
        semana = semanaEntre(inicio, fim);
      } else {
        // Só uma data: vale a SEMANA (2ª–Dom) que a contém, não esse dia
        // sozinho. Quem pede "2026-07-06" quer a semana de referência inteira;
        // devolver-lhe um único dia dava um total muito abaixo do esperado e
        // parecia um erro da API em vez de um pedido mal interpretado.
        const base = analisarData(periodo_inicio ?? periodo_fim);
        if (!base) {
          return jsonError('periodo_inicio/periodo_fim têm de ser datas no formato YYYY-MM-DD.', 400);
        }
        const segunda = segundaDaSemana(base);
        semana = semanaEntre(segunda, somarDias(segunda, 6));
      }
      // +1 porque end_ts é 23:59:59; o arredondamento absorve a hora a mais ou
      // a menos das semanas de mudança de hora.
      const dias = Math.round((semana.end_ts - semana.start_ts + 1) / 86400);
      if (dias > MAX_DIAS_PERIODO) {
        return jsonError(
          `Período de ${dias} dias — o máximo por invocação é ${MAX_DIAS_PERIODO}. Divida em semanas.`,
          400,
        );
      }
    } else {
      semana = semanaPassada();
    }

    const filtroTemporal: FiltroTemporal =
      typeof filtro_temporal === 'string' && FILTROS_TEMPORAIS.includes(filtro_temporal as FiltroTemporal)
        ? filtro_temporal as FiltroTemporal
        : FILTRO_POR_DEFEITO;

    const formulaId: FormulaId = eFormulaId(formula_id) ? formula_id : FORMULA_POR_DEFEITO;

    // ── 4. Empresa ──
    // company_id costuma estar a NULL nas integrações convertidas. Nesse caso
    // pergunta-se à Bolt; se a credencial cobrir várias empresas não se
    // adivinha, porque misturar empresas numa integração é misturar dinheiro
    // de frotas diferentes.
    let companyId: number | null = null;
    const doPedido = Number(companyIdPedido);
    if (companyIdPedido !== undefined && companyIdPedido !== null && String(companyIdPedido).trim() !== '') {
      if (!Number.isInteger(doPedido) || doPedido <= 0) {
        return jsonError(`company_id inválido: "${String(companyIdPedido)}".`, 400);
      }
      companyId = doPedido;
    } else if (config.company_id) {
      companyId = Number(config.company_id);
    }

    let empresasDaCredencial: number[] | null = null;
    if (companyId === null) {
      try {
        empresasDaCredencial = await listarEmpresas(cred);
      } catch (erro) {
        const mensagem = `Não foi possível listar as empresas desta credencial: ${explicarErroBolt(erro)}`;
        await registarLog('error', mensagem, { erros: 1, periodo: semana.periodo });
        return jsonError(mensagem, 502);
      }

      if (empresasDaCredencial.length === 1) {
        companyId = empresasDaCredencial[0];
      } else if (empresasDaCredencial.length === 0) {
        const mensagem =
          `As credenciais da integração "${config.nome}" não estão associadas a nenhuma empresa na Bolt.`;
        await registarLog('error', mensagem, { erros: 1, periodo: semana.periodo });
        return jsonError(mensagem, 409);
      } else {
        const mensagem =
          `A credencial da integração "${config.nome}" cobre ${empresasDaCredencial.length} empresas ` +
          `(${empresasDaCredencial.join(', ')}) e a integração não tem Company ID definido. ` +
          'Preencha o Company ID da integração (ou envie company_id no pedido) — sincronizar todas ' +
          'de uma vez juntava numa só integração o dinheiro de frotas diferentes.';
        await registarLog('error', mensagem, {
          erros: 1,
          periodo: semana.periodo,
          company_ids: empresasDaCredencial,
        });
        return jsonError(mensagem, 409, { company_ids: empresasDaCredencial });
      }
    }

    console.log(
      `[bolt-sync-semana] integração ${integracao_id} · empresa ${companyId} · ${semana.periodo} ` +
        `· filtro ${filtroTemporal} · fórmula ${formulaId}`,
    );

    // ── 5. Viagens ──
    let ordens: FleetOrder[];
    try {
      ordens = await paginar<FleetOrder>(
        cred,
        'getFleetOrders',
        {
          company_id: companyId,
          start_ts: semana.start_ts,
          end_ts: semana.end_ts,
          time_range_filter_type: filtroTemporal,
        },
        { limite: LIMITE_PAGINA },
      );
    } catch (erro) {
      const mensagem = `Semana ${semana.periodo}: falha a ler as viagens da Bolt. ${explicarErroBolt(erro)}`;
      console.error(`[bolt-sync-semana] getFleetOrders falhou`);
      await registarLog('error', mensagem, {
        erros: 1,
        periodo: semana.periodo,
        periodo_inicio: semana.inicio,
        periodo_fim: semana.fim,
        company_id: companyId,
        filtro_temporal: filtroTemporal,
      });
      return jsonError(mensagem, 502, { periodo: semana.periodo });
    }

    const baseResposta = {
      integracao_id,
      integracao: config.nome,
      org_id: orgId,
      company_id: companyId,
      periodo: semana.periodo,
      periodo_inicio: semana.inicio,
      periodo_fim: semana.fim,
      start_ts: semana.start_ts,
      end_ts: semana.end_ts,
      filtro_temporal: filtroTemporal,
      formula_id: formulaId,
      formula: FORMULAS[formulaId],
    };

    // ── 6. Zero viagens: regista e não escreve NADA ──
    if (ordens.length === 0) {
      const mensagem =
        `Semana ${semana.periodo}: a Bolt não devolveu viagens para a empresa ${companyId} ` +
        `(filtro ${filtroTemporal}). Nada foi gravado — um período vazio nunca apaga uma semana já importada.`;
      console.warn(`[bolt-sync-semana] ${mensagem}`);
      await registarLog('vazio', mensagem, {
        ...baseResposta,
        viagens_api: 0,
        resumos_gravados: 0,
        viagens_gravadas: 0,
        erros: 0,
      });
      return json({
        success: true,
        status: 'vazio',
        aviso: true,
        message: mensagem,
        ...baseResposta,
        viagens_api: 0,
        motoristas: 0,
        resumos_gravados: 0,
        viagens_gravadas: 0,
        duracao_ms: Date.now() - inicioMs,
      }, 200);
    }

    // ── 7. Agregação por motorista ──
    const agregado = agregarPorMotorista(ordens, { formulaId });
    console.log(
      `[bolt-sync-semana] ${ordens.length} viagens → ${agregado.linhas.length} motoristas ` +
        `(${agregado.ordens_ignoradas} sem motorista, ${agregado.ordens_sem_preco} sem preço)`,
    );

    // ── 8. Ligação aos motoristas da WeGest ──
    // Só os da org da integração: um match cruzado punha ganhos de uma frota na
    // ficha de um motorista de outra.
    const { data: motoristas, error: erroMotoristas } = await supabase
      .from('motoristas_ativos')
      .select('id, nome, telefone, email, bolt_id')
      .eq('org_id', orgId);

    if (erroMotoristas) {
      console.warn(`[bolt-sync-semana] falha a ler motoristas_ativos: ${erroMotoristas.message}`);
    }

    const matcher = criarMatcherMotoristas((motoristas || []) as MotoristaConhecido[]);

    const motoristaPorChave = new Map<string, string | null>();
    const carimbados = new Set<string>();
    let ligadosPorBoltId = 0;
    let ligadosPorNome = 0;
    let boltIdsGravados = 0;

    for (const linha of agregado.linhas) {
      // bolt_id === driver_uuid é a ligação sem ambiguidade; a cascata por
      // nome/telefone só entra quando ainda ninguém a estabeleceu.
      let motoristaId = matcher.porBoltId(linha.driver_uuid);
      if (motoristaId) {
        ligadosPorBoltId++;
      } else {
        motoristaId = matcher.encontrar(linha.driver_name, linha.driver_phone, null);
        if (motoristaId) {
          ligadosPorNome++;
          // Descoberto por nome: fica gravado para a próxima ser directa.
          // `.is('bolt_id', null)` impede que um segundo motorista da Bolt com
          // nome parecido roube o bolt_id de quem já o tem.
          if (linha.driver_uuid && !carimbados.has(motoristaId)) {
            carimbados.add(motoristaId);
            const { error } = await supabase
              .from('motoristas_ativos')
              .update({ bolt_id: linha.driver_uuid })
              .eq('id', motoristaId)
              .eq('org_id', orgId)
              .is('bolt_id', null);
            if (error) {
              console.warn(`[bolt-sync-semana] falha a gravar bolt_id: ${error.message}`);
            } else {
              boltIdsGravados++;
            }
          }
        }
      }
      motoristaPorChave.set(linha.chave, motoristaId);
    }

    // Duas identidades da Bolt a apontar para o mesmo motorista da WeGest
    // (tipicamente uma com driver_uuid e outra só com nome) repartem os ganhos
    // dele por duas linhas. Não se corrige automaticamente — fundir as linhas
    // erradas é pior do que o problema —, mas tem de aparecer no log.
    const vezesPorMotorista = new Map<string, number>();
    for (const id of motoristaPorChave.values()) {
      if (id) vezesPorMotorista.set(id, (vezesPorMotorista.get(id) ?? 0) + 1);
    }
    const motoristasRepetidos = [...vezesPorMotorista.values()].filter((n) => n > 1).length;

    // ── 9. Resumos semanais, SEMPRE pela RPC do merge por fonte ──
    const gravarResumo = async (linha: LinhaAgregada) => {
      return await supabase.rpc('bolt_resumo_merge_api', {
        p_integracao_id: integracao_id,
        p_org_id: orgId,
        p_periodo_inicio: semana.inicio,
        p_periodo_fim: semana.fim,
        p_periodo: semana.periodo,
        // A chave do merge. Tem de ser o driver_uuid: é o que faz a API
        // completar a linha do CSV em vez de criar uma paralela.
        p_identificador_motorista: linha.driver_uuid,
        p_motorista_nome: linha.driver_name,
        // A API não devolve email de motorista — só o CSV o traz.
        p_email: null,
        p_telefone: linha.driver_phone,
        p_motorista_id: motoristaPorChave.get(linha.chave) ?? null,

        p_ganhos_brutos_app: linha.ganhos_brutos_app,
        p_ganhos_brutos_dinheiro: linha.ganhos_brutos_dinheiro,
        p_gorjetas: linha.gorjetas,
        p_taxas_cancelamento: linha.taxas_cancelamento,
        p_comissoes: linha.comissoes,
        p_portagens: linha.portagens,
        p_taxas_reserva: linha.taxas_reserva,
        p_viagens_terminadas: linha.viagens_terminadas,
        p_distancia_total_km: linha.distancia_total_km,
        p_distancia_media_km: linha.distancia_media_km,

        // As nove parcelas em bruto: é com elas que se calibra a fórmula sem
        // voltar a chamar a API.
        p_api_ride_price: linha.parcelas.ride_price,
        p_api_booking_fee: linha.parcelas.booking_fee,
        p_api_toll_fee: linha.parcelas.toll_fee,
        p_api_cancellation_fee: linha.parcelas.cancellation_fee,
        p_api_tip: linha.parcelas.tip,
        p_api_net_earnings: linha.parcelas.net_earnings,
        p_api_cash_discount: linha.parcelas.cash_discount,
        p_api_in_app_discount: linha.parcelas.in_app_discount,
        p_api_commission: linha.parcelas.commission,
        p_api_orders_total: linha.orders_total,
        p_api_orders_finished: linha.orders_finished,
        p_api_orders_cash: linha.orders_cash,
        // Sem conversão: a unidade da Bolt não está confirmada.
        p_api_ride_distance: linha.ride_distance,
      });
    };

    let resumosGravados = 0;
    let resumosComErro = 0;
    const errosResumo: string[] = [];
    let abortadoPorEstrutura: string | null = null;
    let motivoAborto: 'migracao' | 'chave_legada' = 'migracao';

    for (const linha of agregado.linhas) {
      const { error } = await gravarResumo(linha);
      if (!error) {
        resumosGravados++;
        continue;
      }

      resumosComErro++;
      if (errosResumo.length < 5) errosResumo.push(error.message);

      if (erroChaveLegada(error)) {
        motivoAborto = 'chave_legada';
        abortadoPorEstrutura = error.message;
        break;
      }
      if (erroEstrutural(error)) {
        motivoAborto = 'migracao';
        abortadoPorEstrutura = error.message;
        break;
      }
      console.error(`[bolt-sync-semana] merge falhou para a chave ${linha.chave}: ${error.message}`);
    }

    if (abortadoPorEstrutura) {
      const explicacao = motivoAborto === 'chave_legada'
        ? 'esta semana tem linhas de CSV sem chave_motorista, criadas pela versão ANTIGA do ' +
          'bolt-import-csv. A constraint legada (integracao_id, periodo, identificador_motorista) ' +
          'trava a inserção e a API não consegue completá-las. Faça o deploy do bolt-import-csv ' +
          'actual e reimporte o CSV desta semana (ou preencha chave_motorista nessas linhas); ' +
          'depois volte a sincronizar.'
        : 'a base de dados ainda não tem o que esta função precisa. Aplique as migrações ' +
          '20260804120000_bolt_resumos_chave_motorista.sql e 20260804140000_bolt_merge_por_fonte.sql, ' +
          'por esta ordem.';
      const mensagem =
        `Semana ${semana.periodo}: a gravação foi abortada — ${explicacao} ` +
        `Erro da BD: ${abortadoPorEstrutura}`;
      console.error(`[bolt-sync-semana] ${mensagem}`);
      await registarLog('error', mensagem, {
        ...baseResposta,
        viagens_api: ordens.length,
        motoristas: agregado.linhas.length,
        resumos_gravados: resumosGravados,
        erros: resumosComErro,
        motivo_aborto: motivoAborto,
        erro_bd: abortadoPorEstrutura,
      });
      return jsonError(mensagem, 500, {
        ...baseResposta,
        viagens_api: ordens.length,
        resumos_gravados: resumosGravados,
      });
    }

    // ── 10. Viagens ──
    // Modo sombra: enche a tabela para se poderem conferir os totais contra o
    // CSV, sem que nenhum ecrã financeiro a leia (ver regra 3 no topo).
    const agoraIso = new Date().toISOString();
    const porReferencia = new Map<string, Record<string, unknown>>();
    let viagensSemReferencia = 0;

    for (const ordem of ordens) {
      const referencia = (ordem?.order_reference ?? '').trim();
      if (!referencia) {
        viagensSemReferencia++;
        continue;
      }

      const chave = construirChaveMotorista(ordem.driver_uuid, null, ordem.driver_name);
      const preco = ordem.order_price;

      // Dedupe por order_reference ANTES do upsert: a chave única é global e
      // duas linhas com a mesma referência no mesmo lote dão
      // "ON CONFLICT DO UPDATE command cannot affect row a second time".
      porReferencia.set(referencia, {
        order_reference: referencia,
        integracao_id,
        org_id: orgId,
        company_id: companyId,
        fonte: 'api',
        driver_uuid: ordem.driver_uuid ?? null,
        driver_name: ordem.driver_name ?? null,
        driver_phone: ordem.driver_phone ?? null,
        motorista_id: chave ? motoristaPorChave.get(chave) ?? null : null,
        vehicle_license_plate: ordem.vehicle_license_plate ?? null,
        vehicle_model: ordem.vehicle_model ?? null,
        payment_method: ordem.payment_method ?? null,
        order_status: ordem.order_status ?? null,
        order_created_timestamp: segundosParaIso(ordem.order_created_timestamp),
        payment_confirmed_timestamp: segundosParaIso(ordem.payment_confirmed_timestamp),
        pickup_address: ordem.pickup_address ?? null,
        destination_address: ordem.destination_address ?? null,

        // As nove parcelas, cada uma na sua coluna.
        ride_price: preco?.ride_price ?? null,
        booking_fee: preco?.booking_fee ?? null,
        toll_fee: preco?.toll_fee ?? null,
        cancellation_fee: preco?.cancellation_fee ?? null,
        tip: preco?.tip ?? null,
        net_earnings: preco?.net_earnings ?? null,
        cash_discount: preco?.cash_discount ?? null,
        in_app_discount: preco?.in_app_discount ?? null,
        commission: preco?.commission ?? null,
        ride_distance: ordem.ride_distance ?? null,

        // NULL DE PROPÓSITO — ver regra 3 no cabeçalho. Não trocar por
        // net_earnings/ride_price sem primeiro mudar BOLT_FONTE_FINANCEIRA.
        driver_earnings: null,
        total_price: null,

        dados_raw: {
          company_id: companyId,
          order_price: preco ?? null,
          ride_distance: ordem.ride_distance ?? null,
          formula_id: formulaId,
          filtro_temporal: filtroTemporal,
          sincronizado_em: agoraIso,
        },
        updated_at: agoraIso,
      });
    }

    // Sem as colunas novas (migração das parcelas por aplicar) grava-se o que a
    // tabela já aceita — melhor uma viagem sem as parcelas nas colunas (ficam
    // em dados_raw) do que nenhuma viagem.
    const COLUNAS_NOVAS = [
      'company_id',
      'fonte',
      'ride_price',
      'booking_fee',
      'toll_fee',
      'cancellation_fee',
      'tip',
      'net_earnings',
      'cash_discount',
      'in_app_discount',
      'ride_distance',
    ];

    let colunasViagensEmFalta = false;
    let viagensGravadas = 0;
    let viagensComErro = 0;
    const errosViagens: string[] = [];

    const upsertViagens = async (lote: Record<string, unknown>[]) => {
      if (!colunasViagensEmFalta) {
        const { error } = await supabase
          .from('bolt_viagens')
          .upsert(lote, { onConflict: 'order_reference' });
        if (!error) return null;
        if (!faltaColunaViagens(error)) return error;
        console.warn(
          '[bolt-sync-semana] bolt_viagens ainda não tem as colunas das parcelas — ' +
            'migração 20260804160000_bolt_viagens_api_parcelas.sql por aplicar. ' +
            'As parcelas ficam só em dados_raw.',
        );
        colunasViagensEmFalta = true;
      }

      const legado = lote.map((linha) => {
        const copia = { ...linha };
        for (const coluna of COLUNAS_NOVAS) delete copia[coluna];
        return copia;
      });
      const { error } = await supabase
        .from('bolt_viagens')
        .upsert(legado, { onConflict: 'order_reference' });
      return error;
    };

    const paraGravar = [...porReferencia.values()];
    for (let i = 0; i < paraGravar.length; i += LOTE_VIAGENS) {
      const lote = paraGravar.slice(i, i + LOTE_VIAGENS);
      const error = await upsertViagens(lote);
      if (error) {
        viagensComErro += lote.length;
        if (errosViagens.length < 3) errosViagens.push(error.message);
        console.error(`[bolt-sync-semana] upsert de viagens falhou: ${error.message}`);
      } else {
        viagensGravadas += lote.length;
      }
    }

    // ── 11. Estado final ──
    let status: EstadoSync;
    let mensagem: string;

    if (resumosGravados === 0) {
      status = 'error';
      mensagem =
        `Semana ${semana.periodo}: nenhum resumo gravado. A Bolt devolveu ${ordens.length} viagens ` +
        `de ${agregado.linhas.length} motoristas e falharam todas (${resumosComErro} erros).`;
    } else {
      status = 'success';
      mensagem =
        `Semana ${semana.periodo}: ${resumosGravados} motoristas actualizados a partir de ` +
        `${ordens.length} viagens da API (empresa ${companyId}, fórmula ${formulaId}). ` +
        `Bruto de viagens ${euros(agregado.totais.bruto_viagens)}.`;
    }

    const avisos: string[] = [];
    if (resumosComErro > 0 && resumosGravados > 0) {
      avisos.push(`${resumosComErro} motoristas não gravados (${errosResumo[0] ?? 'erro desconhecido'})`);
    }
    if (agregado.ordens_ignoradas > 0) {
      avisos.push(`${agregado.ordens_ignoradas} viagens sem motorista identificável (sem driver_uuid nem nome)`);
    }
    if (viagensComErro > 0) {
      avisos.push(`${viagensComErro} viagens não gravadas em bolt_viagens (${errosViagens[0] ?? 'erro desconhecido'})`);
    }
    if (viagensSemReferencia > 0) {
      avisos.push(`${viagensSemReferencia} viagens sem order_reference`);
    }
    if (colunasViagensEmFalta) {
      avisos.push(
        'bolt_viagens sem as colunas das parcelas (migração 20260804160000 por aplicar) — ' +
          'as parcelas ficaram só em dados_raw',
      );
    }
    if (agregado.linhas.length > 0 && ligadosPorBoltId + ligadosPorNome === 0) {
      avisos.push('nenhum motorista da Bolt foi ligado a um motorista da WeGest');
    }
    if (motoristasRepetidos > 0) {
      avisos.push(
        `${motoristasRepetidos} motoristas da WeGest ligados a mais do que uma identidade Bolt — ` +
          'os ganhos ficam repartidos por várias linhas da mesma semana',
      );
    }
    if (avisos.length > 0) {
      if (status === 'success') status = 'warning';
      mensagem = `${mensagem} Atenção: ${avisos.join('; ')}.`;
    }

    const detalhes = {
      ...baseResposta,
      viagens_api: ordens.length,
      motoristas: agregado.linhas.length,
      resumos_gravados: resumosGravados,
      resumos_com_erro: resumosComErro,
      viagens_gravadas: viagensGravadas,
      viagens_com_erro: viagensComErro,
      viagens_sem_referencia: viagensSemReferencia,
      viagens_ignoradas: agregado.ordens_ignoradas,
      viagens_sem_preco: agregado.ordens_sem_preco,
      ligados_por_bolt_id: ligadosPorBoltId,
      ligados_por_nome: ligadosPorNome,
      bolt_ids_gravados: boltIdsGravados,
      motoristas_repetidos: motoristasRepetidos,
      sem_motorista_wegest: agregado.linhas.length - ligadosPorBoltId - ligadosPorNome,
      erros: resumosComErro,
      divisor_distancia: DIVISOR_DISTANCIA_POR_DEFEITO,
      totais: agregado.totais,
      // As 4 variantes na mesma corrida: é o que permite escolher a fórmula
      // comparando com a semana de referência sem voltar a chamar a API.
      variantes: agregado.variantes,
      erros_resumo: errosResumo,
      erros_viagens: errosViagens,
      avisos,
    };

    await registarLog(status, mensagem, detalhes);

    // ultimo_sync só quando alguma coisa foi mesmo gravada.
    if (resumosGravados > 0) {
      const { error } = await supabase
        .from('plataformas_configuracao')
        .update({ ultimo_sync: agoraIso })
        .eq('id', integracao_id);
      if (error) console.warn(`[bolt-sync-semana] falha a actualizar ultimo_sync: ${error.message}`);
    }

    console.log(
      `[bolt-sync-semana] fim · ${status} · resumos ${resumosGravados}/${agregado.linhas.length} · ` +
        `viagens ${viagensGravadas}/${paraGravar.length} · ${Date.now() - inicioMs}ms`,
    );

    return json({
      success: resumosGravados > 0,
      status,
      aviso: status === 'warning',
      message: mensagem,
      ...detalhes,
      duracao_ms: Date.now() - inicioMs,
    }, resumosGravados > 0 ? 200 : 500);
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    console.error(`[bolt-sync-semana] erro inesperado: ${detalhe}`);
    if (logDeEmergencia) {
      try {
        await logDeEmergencia(`Sincronização Bolt abortada por excepção: ${detalhe}`);
      } catch (erroLog) {
        console.error(`[bolt-sync-semana] nem o log de emergência gravou: ${erroLog}`);
      }
    }
    return jsonError(detalhe || 'Erro interno', 500);
  } finally {
    // O token vive 10 minutos e o isolate pode ser reaproveitado por outra
    // invocação, possivelmente de outra org — não fica em memória.
    if (clientIdEmUso) limparCacheTokens(clientIdEmUso);
  }
});
