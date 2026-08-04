import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  construirChaveMotorista,
  criarMatcherMotoristas,
  type MotoristaConhecido,
  parseCSV,
  parseNumber,
  validarCabecalho,
} from '../_shared/bolt-import-csv/parse.ts';
import {
  agruparSemanas,
  avaliarPisoRelativo,
  formatarEuros,
  type LinhaHistorico,
  SEMANAS_HISTORICO,
} from '../_shared/bolt-import-csv/qualidade.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonError = (error: string, status: number) =>
  new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const json = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Estado da importação, tal como fica gravado em bolt_sync_logs.status. */
type EstadoImportacao = 'success' | 'warning' | 'vazio' | 'error';

// CSV column name → DB column name mapping
const COLUMN_MAP: Record<string, string> = {
  'Motorista': 'motorista_nome',
  'Email': 'email',
  'Telemóvel': 'telefone',
  'Ganhos brutos (total)|€': 'ganhos_brutos_total',
  'Ganhos brutos (pagamentos na app)|€': 'ganhos_brutos_app',
  'IVA sobre os ganhos brutos (pagamentos na app)|€': 'iva_ganhos_app',
  'Ganhos brutos (pagamentos em dinheiro)|€': 'ganhos_brutos_dinheiro',
  'IVA sobre os ganhos brutos (pagamentos em dinheiro)|€': 'iva_ganhos_dinheiro',
  'Dinheiro recebido|€': 'dinheiro_recebido',
  'Gorjetas dos passageiros|€': 'gorjetas',
  'Ganhos da campanha|€': 'ganhos_campanha',
  'Reembolsos de despesas|€': 'reembolsos_despesas',
  'Taxas de cancelamento|€': 'taxas_cancelamento',
  'IVA das taxas de cancelamento|€': 'iva_taxas_cancelamento',
  'Portagens|€': 'portagens',
  'Taxas de reserva|€': 'taxas_reserva',
  'IVA das taxas de reserva|€': 'iva_taxas_reserva',
  'Total de taxas|€': 'total_taxas',
  'Comissões|€': 'comissoes',
  'Reembolsos aos passageiros|€': 'reembolsos_passageiros',
  'Outras taxas|€': 'outras_taxas',
  'Ganhos líquidos|€': 'ganhos_liquidos',
  'Pagamento previsto|€': 'pagamento_previsto',
  'Ganhos brutos por hora|€/h': 'ganhos_brutos_hora',
  'Ganhos líquidos por hora|€/h': 'ganhos_liquidos_hora',
  'Desconto de comissão (in-app)|€': 'desconto_comissao_app',
  'Desconto da comissão (dinheiro)|€': 'desconto_comissao_dinheiro',
  'Identificador do motorista': 'identificador_motorista',
  'Identificador individual': 'identificador_individual',
  'Nível': 'nivel',
  'Categorias ativas': 'categorias_ativas',
  'Viagens pagas com dinheiro ativadas': 'viagens_dinheiro_ativadas',
  'Pontuação de motorista|%': 'pontuacao_motorista',
  'Viagens terminadas': 'viagens_terminadas',
  'Taxa de aceitação total|%': 'taxa_aceitacao',
  'Tempo online (min)': 'tempo_online_min',
  'Utilização|%': 'utilizacao',
  'Taxa de finalização (todas as viagens)|%': 'taxa_finalizacao_todas',
  'Taxa de finalização (viagens aceites)|%': 'taxa_finalizacao_aceites',
  'Distância média das viagens|km': 'distancia_media_km',
  'Distância total das viagens|km': 'distancia_total_km',
  'Classificação média do motorista|★': 'classificacao_media',
};

const NUMERIC_COLUMNS = new Set([
  'ganhos_brutos_total', 'ganhos_brutos_app', 'iva_ganhos_app', 'ganhos_brutos_dinheiro',
  'iva_ganhos_dinheiro', 'dinheiro_recebido', 'gorjetas', 'ganhos_campanha',
  'reembolsos_despesas', 'taxas_cancelamento', 'iva_taxas_cancelamento', 'portagens',
  'taxas_reserva', 'iva_taxas_reserva', 'total_taxas', 'comissoes',
  'reembolsos_passageiros', 'outras_taxas', 'ganhos_liquidos', 'pagamento_previsto',
  'ganhos_brutos_hora', 'ganhos_liquidos_hora', 'desconto_comissao_app',
  'desconto_comissao_dinheiro', 'pontuacao_motorista', 'taxa_aceitacao',
  'tempo_online_min', 'utilizacao', 'taxa_finalizacao_todas', 'taxa_finalizacao_aceites',
  'distancia_media_km', 'distancia_total_km', 'classificacao_media',
]);

const INTEGER_COLUMNS = new Set(['viagens_terminadas']);

function getDatesFromISOWeek(weekStr: string): { start: string, end: string } | null {
  // Expected format: YYYYWww (e.g., 2026W13)
  const match = weekStr.match(/^(\d{4})W(\d{2})$/);
  if (!match) return null;

  const year = parseInt(match[1]);
  const week = parseInt(match[2]);

  // ISO weeks start on Monday.
  // Simple algorithm to find the first Monday of the year:
  // Jan 4th is always in week 1.
  const jan4 = new Date(year, 0, 4);
  const day = jan4.getDay(); // 0 is Sunday, 1 is Monday...
  const diff = day === 0 ? 6 : day - 1; // Days from Monday
  const firstMonday = new Date(jan4.getTime() - (diff * 24 * 60 * 60 * 1000));

  // Add (week-1) weeks to firstMonday
  const start = new Date(firstMonday.getTime() + ((week - 1) * 7 * 24 * 60 * 60 * 1000));
  const end = new Date(start.getTime() + (6 * 24 * 60 * 60 * 1000));

  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  };
}

/**
 * Erro que indica que a migração da chave estável ainda não foi aplicada:
 * ou não existe a coluna chave_motorista (42703 / PGRST204), ou não existe o
 * índice único que o ON CONFLICT precisa de inferir (42P10).
 */
function faltaMigracaoChave(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === '42P10' || error.code === 'PGRST204') return true;
  return /chave_motorista/i.test(error.message || '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Preenchido assim que se souber a org/integração, para que uma excepção a
  // meio da importação também deixe rasto em bolt_sync_logs em vez de morrer
  // só nos logs do runtime.
  let logDeEmergencia: ((mensagem: string) => Promise<void>) | null = null;

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ── Auth: aceita 2 chamadores ──
    // 1) Automação Apify (robot) — envia a service-role key directamente.
    //    Sem sessão de utilizador; a org é determinada só pelo integracao_id.
    // 2) Utilizador autenticado (upload manual via UI) — precisa de ser
    //    admin da org dona da integração (service-role bypassa RLS →
    //    validar à mão, mesmo padrão que bp/edp/viaverde/repsol-import-csv).
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '');
    const isRobotCall = bearerToken === SERVICE_ROLE_KEY;

    let callerUserId: string | null = null;
    if (!isRobotCall) {
      if (!bearerToken) return jsonError('Não autenticado.', 401);
      const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
        error: authErr,
      } = await anonClient.auth.getUser();
      if (authErr || !user) return jsonError('Sessão inválida.', 401);
      // O papel de admin é POR-ORG (user_organizacoes) — o flag global
      // profiles.is_admin e o legado profiles.org_id dão 403 errado a
      // utilizadores multi-org. A permissão é validada mais abaixo, contra
      // a org dona da integração.
      callerUserId = user.id;
    }

    const body = await req.json();
    const { integracao_id, dados_csv_bolt, periodo, periodo_inicio, periodo_fim } = body;

    if (!integracao_id) {
      return jsonError('integracao_id é obrigatório', 400);
    }

    if (!dados_csv_bolt) {
      return jsonError('dados_csv_bolt é obrigatório', 400);
    }

    // A integração determina a org. Chamada de utilizador TEM de pertencer à
    // mesma org (chamada de robot confia no integracao_id, já que quem tem a
    // service-role key já tem acesso total à BD de qualquer forma).
    const { data: intConfig } = await supabase
      .from('plataformas_configuracao')
      .select('org_id')
      .eq('id', integracao_id)
      .single();
    if (!intConfig) return jsonError('Integração não encontrada.', 404);
    if (callerUserId) {
      const { data: membership } = await supabase
        .from('user_organizacoes')
        .select('is_admin')
        .eq('user_id', callerUserId)
        .eq('org_id', intConfig.org_id)
        .maybeSingle();
      if (!membership?.is_admin) {
        return jsonError('Sem permissão de administrador nesta organização.', 403);
      }
    }
    const orgId = intConfig.org_id;

    // ── Log de sincronização ──
    // Chamado SEMPRE, em todos os caminhos de saída. O guard `if (imported > 0)`
    // que aqui estava antes é a razão de 5 semanas estragadas (2 nunca
    // importadas, 2 com 204 linhas a 0,00 EUR, 1 com 8 linhas em vez de ~205)
    // não terem deixado rasto nenhum em bolt_sync_logs.
    const registarLog = async (
      status: EstadoImportacao,
      mensagem: string,
      detalhes: Record<string, unknown> = {},
    ) => {
      const { error } = await supabase.from('bolt_sync_logs').insert({
        org_id: orgId,
        integracao_id,
        tipo: 'csv_import',
        status,
        mensagem,
        viagens_novas: Number(detalhes.importados ?? 0),
        erros: Number(detalhes.erros ?? 0),
        detalhes,
      });
      if (error) {
        console.error('bolt-import-csv: falha a gravar em bolt_sync_logs:', error.message);
      }
    };

    logDeEmergencia = (mensagem: string) =>
      registarLog('error', mensagem, { importados: 0, erros: 1 });

    // ── Período ──
    // Calculado antes de tocar no CSV para que qualquer log (incluindo o de
    // cabeçalho inválido) já saiba a que semana se refere.
    // Calculate last week's Monday–Sunday (the actor always fetches "Semana passada")
    const getLastWeekDates = () => {
      const now = new Date();
      // Em UTC, ajustar para o dia da semana correto
      const dow = now.getDay(); // 0=Sun, 1=Mon … 6=Sat
      const daysToThisMonday = dow === 0 ? 6 : dow - 1;

      // Encontrar a segunda-feira desta semana
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - daysToThisMonday);
      thisMonday.setHours(0, 0, 0, 0);

      // A semana passada começa 7 dias antes
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);

      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);

      return {
        start: lastMonday.toISOString().split('T')[0],
        end: lastSunday.toISOString().split('T')[0],
      };
    };

    const lastWeek = getLastWeekDates();

    // The Apify actor sometimes wrongly sends the execution date as periodo_inicio.
    // If the provided start date is NOT a Monday, or is very close to today, ignore it!
    let periodoInicioValue = periodo_inicio;
    let periodoFimValue = periodo_fim;

    if (periodoInicioValue) {
      const d = new Date(periodoInicioValue);
      // If it's not a Monday, or it's in the current week/future, ignore the payload's date
      if (d.getDay() !== 1 || d.getTime() > new Date().getTime() - 2 * 24 * 60 * 60 * 1000) {
        console.log(`bolt-import-csv: Ignoring buggy payload dates (${periodoInicioValue}). Using calculated last week.`);
        periodoInicioValue = undefined;
      }
    }

    periodoInicioValue = periodoInicioValue || lastWeek.start;
    periodoFimValue    = periodoFimValue || lastWeek.end;
    const periodoValue = periodo || `${periodoInicioValue} a ${periodoFimValue}`;

    console.log(`bolt-import-csv: periodo=${periodoValue}, inicio=${periodoInicioValue}, fim=${periodoFimValue}`);

    // ── 1. Parse + validação de cabeçalho (bloqueante) ──
    // Sem a coluna do bruto total o ficheiro não é aproveitável: devolve-se 422
    // e NÃO se grava absolutamente nada em bolt_resumos_semanais.
    const { cabecalho, linhas: rows } = parseCSV(dados_csv_bolt);
    console.log(`bolt-import-csv: Parsed ${rows.length} rows from CSV (${cabecalho.length} colunas)`);

    const validacao = validarCabecalho(cabecalho);
    if (!validacao.ok) {
      console.error(`bolt-import-csv: cabeçalho inválido (${validacao.motivo}) — ${validacao.mensagem}`);
      await registarLog('error', `Semana ${periodoValue}: ${validacao.mensagem}`, {
        motivo: validacao.motivo,
        periodo: periodoValue,
        colunas_lidas: cabecalho.length,
        cabecalho: cabecalho.slice(0, 60).map((c) => c.slice(0, 200)),
        linhas_no_ficheiro: rows.length,
        importados: 0,
        erros: rows.length,
      });
      return json({
        success: false,
        status: 'error',
        error: validacao.mensagem,
        motivo: validacao.motivo,
        colunas_lidas: cabecalho,
        imported: 0,
        total_rows: rows.length,
        periodo: periodoValue,
      }, 422);
    }

    // ── 2. CSV sem linhas de dados ──
    // Cabeçalho válido mas nenhum motorista: fica registado como 'vazio' em vez
    // de desaparecer sem deixar rasto.
    if (rows.length === 0) {
      const mensagem =
        `Semana ${periodoValue}: CSV da Bolt sem linhas de dados — cabeçalho válido, ` +
        `zero motoristas no ficheiro. Nada foi gravado.`;
      console.warn(`bolt-import-csv: ${mensagem}`);
      await registarLog('vazio', mensagem, {
        periodo: periodoValue,
        periodo_inicio: periodoInicioValue,
        periodo_fim: periodoFimValue,
        colunas_lidas: cabecalho.length,
        linhas_no_ficheiro: 0,
        importados: 0,
        erros: 0,
      });
      return json({
        success: true,
        status: 'vazio',
        aviso: true,
        message: mensagem,
        imported: 0,
        errors: 0,
        total_rows: 0,
        periodo: periodoValue,
      }, 200);
    }

    // Fetch motoristas for name matching (só da org da integração — evita
    // fazer match cruzado com motoristas de outras orgs)
    const { data: motoristas } = await supabase
      .from('motoristas_ativos')
      .select('id, nome, telefone, email')
      .eq('org_id', orgId);

    // Cascata nome exacto → telefone → email → nome parcial. A mesma que o
    // bolt-sync-semana usa para a API — uma cópia só, em parse.ts.
    const matcher = criarMatcherMotoristas((motoristas || []) as MotoristaConhecido[]);
    const findMotoristaId = (nome?: string, telefone?: string, email?: string): string | null =>
      matcher.encontrar(nome, telefone, email);

    // A chave estável (chave_motorista) só existe depois de aplicada a migração
    // 20260804120000_bolt_resumos_chave_motorista.sql. Enquanto não estiver
    // aplicada cai-se para a chave antiga — mas isso vai para o log como aviso,
    // porque nesse estado as linhas sem identificador_motorista continuam a
    // duplicar a cada reimportação.
    let migracaoChaveEmFalta = false;

    const gravarRegisto = async (record: Record<string, any>) => {
      if (!migracaoChaveEmFalta) {
        const { error } = await supabase
          .from('bolt_resumos_semanais')
          .upsert(record, { onConflict: 'integracao_id,periodo,chave_motorista' });
        if (!error) return null;
        if (!faltaMigracaoChave(error)) return error;
        console.warn(
          'bolt-import-csv: chave_motorista ainda não existe na BD — migração por aplicar. ' +
          'A usar a chave antiga (duplicados possíveis).',
        );
        migracaoChaveEmFalta = true;
      }

      const { chave_motorista: _semChaveNova, ...legado } = record;
      const { error } = await supabase
        .from('bolt_resumos_semanais')
        .upsert(legado, { onConflict: 'integracao_id,periodo,identificador_motorista' });
      return error;
    };

    let imported = 0;
    let errors = 0;
    let semChave = 0;
    let brutoImportado = 0;

    for (const row of rows) {
      try {
        const record: Record<string, any> = {
          integracao_id,
          org_id: orgId,
          periodo: periodoValue,
          raw_data: row,
          ...(periodoInicioValue && { periodo_inicio: periodoInicioValue }),
          ...(periodoFimValue && { periodo_fim: periodoFimValue }),
        };

        // Map CSV columns to DB columns
        for (const [csvCol, dbCol] of Object.entries(COLUMN_MAP)) {
          const value = row[csvCol];
          if (value === undefined) continue;

          if (NUMERIC_COLUMNS.has(dbCol)) {
            record[dbCol] = parseNumber(value);
          } else if (INTEGER_COLUMNS.has(dbCol)) {
            record[dbCol] = Math.round(parseNumber(value));
          } else {
            record[dbCol] = value || null;
          }
        }

        // Chave de upsert estável: identificador → email → nome normalizado.
        const chave = construirChaveMotorista(
          record.identificador_motorista,
          record.email,
          record.motorista_nome,
        );
        if (!chave) {
          // Sem identificador, sem email e sem nome não há como deduplicar a
          // linha: gravá-la significa acumular um duplicado novo em cada
          // reimportação. Conta como erro e aparece no log.
          console.error('bolt-import-csv: linha sem identificador, email ou nome — ignorada:', row);
          semChave++;
          errors++;
          continue;
        }
        record.chave_motorista = chave;

        // Try to match motorista
        record.motorista_id = findMotoristaId(record.motorista_nome, record.telefone, record.email);

        if (record.motorista_id) {
          console.log(`bolt-import-csv: Match found for ${record.motorista_nome} -> ID: ${record.motorista_id}`);

          // Auto-save bolt_id to motoristas_ativos if not present
          if (record.identificador_motorista) {
            const { error: updateError } = await supabase
              .from('motoristas_ativos')
              .update({ bolt_id: record.identificador_motorista })
              .eq('id', record.motorista_id)
              .is('bolt_id', null); // Only update if empty

            if (updateError) {
              console.warn(`bolt-import-csv: Failed to auto-save bolt_id for ${record.motorista_nome}:`, updateError.message);
            } else {
              console.log(`bolt-import-csv: Auto-saved bolt_id for ${record.motorista_nome}`);
            }
          }
        } else {
          console.warn(`bolt-import-csv: NO match found for ${record.motorista_nome} (${record.telefone || 'no phone'})`);
        }

        // Upsert
        const upsertError = await gravarRegisto(record);

        if (upsertError) {
          console.error('bolt-import-csv upsert error:', upsertError.message, 'for row:', record.motorista_nome);
          errors++;
        } else {
          imported++;
          brutoImportado += Number(record.ganhos_brutos_total ?? 0) || 0;
        }
      } catch (rowError) {
        console.error('bolt-import-csv row error:', rowError);
        errors++;
      }
    }

    // ── 3. Piso relativo ──
    // Mediana das SEMANAS_HISTORICO semanas anteriores da MESMA integração. A
    // janela é o dobro (8 semanas) porque há semanas em falta no histórico
    // (2026-05-11, 2026-06-15) e uma janela justa devolveria menos semanas do
    // que as pedidas.
    const carregarHistorico = async (): Promise<LinhaHistorico[]> => {
      const inicioJanela = new Date(`${periodoInicioValue}T00:00:00Z`);
      inicioJanela.setUTCDate(inicioJanela.getUTCDate() - SEMANAS_HISTORICO * 2 * 7);
      const desde = inicioJanela.toISOString().split('T')[0];

      const PAGINA = 1000;
      const todas: LinhaHistorico[] = [];
      // Paginado: 8 semanas × ~205 motoristas passa do limite por omissão do
      // PostgREST, e um histórico truncado dava uma mediana falsamente baixa.
      for (let pagina = 0; pagina < 10; pagina++) {
        const { data, error } = await supabase
          .from('bolt_resumos_semanais')
          .select('periodo, periodo_inicio, ganhos_brutos_total')
          .eq('integracao_id', integracao_id)
          .gte('periodo_inicio', desde)
          .lt('periodo_inicio', periodoInicioValue)
          .order('periodo_inicio', { ascending: false })
          .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);

        if (error) {
          console.error('bolt-import-csv: falha a ler histórico para o piso relativo:', error.message);
          break;
        }
        if (!data || data.length === 0) break;
        todas.push(...(data as LinhaHistorico[]));
        if (data.length < PAGINA) break;
      }
      return todas;
    };

    const semanas = agruparSemanas(await carregarHistorico(), periodoValue);
    const avaliacao = avaliarPisoRelativo(imported, brutoImportado, semanas);

    // ── 4. Estado final + log (sempre) ──
    let status: EstadoImportacao;
    let mensagem: string;

    if (imported === 0) {
      status = 'error';
      mensagem =
        `Semana ${periodoValue}: nenhuma linha gravada. O CSV trazia ${rows.length} linhas e ` +
        `falharam todas (${errors} erros${semChave > 0 ? `, ${semChave} sem identificador/email/nome` : ''}).`;
    } else if (avaliacao.avisar) {
      status = 'warning';
      mensagem = `Semana ${periodoValue}: ${avaliacao.mensagem}`;
    } else {
      status = 'success';
      mensagem = `Importação Apify/Robot: ${imported} registos processados para ${periodoValue}`;
    }

    // Avisos que não mudam o número de linhas mas não podem passar em silêncio.
    const avisosExtra: string[] = [];
    if (semChave > 0 && imported > 0) {
      avisosExtra.push(`${semChave} linhas ignoradas por não terem identificador, email nem nome`);
    }
    const errosDeGravacao = errors - semChave;
    if (errosDeGravacao > 0 && imported > 0) {
      avisosExtra.push(`${errosDeGravacao} linhas com erro de gravação`);
    }
    if (migracaoChaveEmFalta) {
      avisosExtra.push(
        'a coluna/índice chave_motorista ainda não existe na BD (migração ' +
        '20260804120000_bolt_resumos_chave_motorista.sql por aplicar) — as linhas sem ' +
        'identificador_motorista continuam a duplicar',
      );
    }
    if (avisosExtra.length > 0) {
      if (status === 'success') status = 'warning';
      mensagem = `${mensagem} Atenção: ${avisosExtra.join('; ')}.`;
    }

    const detalhes = {
      periodo: periodoValue,
      periodo_inicio: periodoInicioValue,
      periodo_fim: periodoFimValue,
      colunas_lidas: cabecalho.length,
      linhas_no_ficheiro: rows.length,
      importados: imported,
      erros: errors,
      sem_chave: semChave,
      bruto_importado: Number(brutoImportado.toFixed(2)),
      mediana_linhas: avaliacao.medianaLinhas,
      mediana_bruto: Number(avaliacao.medianaBruto.toFixed(2)),
      semanas_comparadas: avaliacao.semanasComparadas,
      migracao_chave_em_falta: migracaoChaveEmFalta,
    };

    await registarLog(status, mensagem, detalhes);

    console.log(
      `bolt-import-csv: Done. Status: ${status}, Imported: ${imported}, Errors: ${errors}, ` +
      `Bruto: ${formatarEuros(brutoImportado)}`,
    );

    // imported === 0 com linhas no ficheiro é falha a sério: responder 500 para
    // que o chamador (Apify/UI) veja o erro em vez de um 200 tranquilo.
    return json({
      success: imported > 0,
      status,
      aviso: status === 'warning',
      message: mensagem,
      imported,
      errors,
      sem_chave: semChave,
      total_rows: rows.length,
      bruto_importado: detalhes.bruto_importado,
      mediana_linhas: avaliacao.medianaLinhas,
      mediana_bruto: detalhes.mediana_bruto,
      periodo: periodoValue,
      periodo_inicio: periodoInicioValue,
      periodo_fim: periodoFimValue,
    }, imported === 0 ? 500 : 200);
  } catch (error) {
    console.error('bolt-import-csv error:', error);
    const detalhe = error instanceof Error ? error.message : String(error);
    if (logDeEmergencia) {
      try {
        await logDeEmergencia(`Importação Bolt abortada por excepção: ${detalhe}`);
      } catch (erroLog) {
        console.error('bolt-import-csv: nem o log de emergência gravou:', erroLog);
      }
    }
    return jsonError(detalhe || 'Erro interno', 500);
  }
});
