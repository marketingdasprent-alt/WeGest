import { addDays, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { COLUNAS_CONTRATO_PARA_PERIODO } from '@/components/administrativo/motorista-resumo/periodosDoContrato';
import type {
  BoltResumoRow,
  ContratoComCondutores,
  DadosResumoSemana,
  MotoristaParaResumo,
  TransacaoMotoristaRow,
  UberDriverRow,
} from '@/components/administrativo/motorista-resumo/dadosResumoSemana';

type Resultado<T> = { data: T[] | null; error: unknown };
type DadosFechados = Pick<
  DadosResumoSemana,
  'boltResumos' | 'uberDrivers' | 'combustivel' | 'portagens' | 'contratos'
>;

const dia = (d: Date) => format(d, 'yyyy-MM-dd');
const linhas = <T>(r: Resultado<T>) => (r.data ?? []) as T[];

/** Tabelas que qualquer pessoa com a ficha do motorista já lê (motoristas_gestao). */
async function carregarAbertos(weekStart: Date, weekEnd: Date) {
  const fmtD = (d: Date) => format(d, 'yyyyMMdd');
  const [motoristas, uberResumos, atividadeUber, tarifas, tarifasModelo, financeiro] =
    await Promise.all([
      supabase
        .from('motoristas_ativos')
        .select(
          'id, nome, recibo_verde, retencao_irs, retencao_iva_pct, retencao_irs_pct, corte_sem_recibo_pct, uber_uuid, bolt_id, gestor_responsavel, data_contratacao, status_ativo, desativado_em, created_at, is_conta_frota'
        ),
      supabase
        .from('uber_resumos_semanais')
        .select('uber_driver_id, motorista_nome, motorista_id, ganhos_brutos, gorjetas, viagens')
        .lte('periodo_inicio', dia(weekEnd))
        .gte('periodo_fim', dia(weekStart)),
      supabase
        .from('uber_atividade_motoristas')
        .select('uber_driver_id, viagens_concluidas')
        .eq('periodo', `${fmtD(weekStart)}-${fmtD(weekEnd)}`),
      supabase.from('renting_tarifas').select('id, grupo_id, preco_semana').eq('ativa', true),
      supabase
        .from('renting_tarifa_precos_modelo')
        .select('tarifa_id, modelo_id, preco_semana, renting_tarifas!inner(tipo, ativa)')
        .eq('renting_tarifas.tipo', 'tvde')
        .eq('renting_tarifas.ativa', true),
      supabase
        .from('motorista_financeiro')
        .select('motorista_id, valor, categoria, tipo')
        .gte('data_movimento', dia(weekStart))
        .lte('data_movimento', dia(weekEnd))
        .neq('status', 'cancelado'),
    ]);
  if (uberResumos.error) throw uberResumos.error;
  return {
    motoristas: linhas(motoristas) as MotoristaParaResumo[],
    uberResumos: linhas(uberResumos),
    atividadeUber: linhas(atividadeUber),
    tarifas: linhas(tarifas),
    tarifasModelo: linhas(tarifasModelo),
    financeiro: linhas(financeiro),
  };
}

type TabelaTransacoes =
  | 'bp_transacoes'
  | 'repsol_transacoes'
  | 'edp_transacoes'
  | 'via_verde_transacoes';

/** Lista de Contas/Resumo: a org inteira, pelas políticas de quem tem o Financeiro. */
async function carregarFechadosDaOrg(weekStart: Date, weekEnd: Date): Promise<DadosFechados> {
  const iniUtc = `${dia(weekStart)}T00:00:00Z`;
  const fimUtc = `${dia(weekEnd)}T23:59:59Z`;
  const transacoes = (tabela: TabelaTransacoes) =>
    supabase
      .from(tabela)
      .select('motorista_id, amount')
      .gte('transaction_date', iniUtc)
      .lte('transaction_date', fimUtc)
      .not('motorista_id', 'is', null);

  const [uberDrivers, bp, repsol, edp, viaVerde, contratos, boltResumos] = await Promise.all([
    supabase.from('uber_drivers').select('uber_driver_id, motorista_id, full_name, is_conta_frota'),
    transacoes('bp_transacoes'),
    transacoes('repsol_transacoes'),
    transacoes('edp_transacoes'),
    transacoes('via_verde_transacoes'),
    supabase
      .from('contratos_renting')
      .select(COLUNAS_CONTRATO_PARA_PERIODO)
      .is('deleted_at', null)
      .lt('data_inicio', dia(addDays(weekEnd, 1)))
      .or(`data_fim.is.null,data_fim.gte.${dia(weekStart)}`),
    supabase
      .from('bolt_resumos_semanais')
      .select(
        'motorista_id, motorista_nome, liquido_a_pagar, gorjetas, viagens_terminadas, integracao_id, identificador_motorista'
      )
      .lte('periodo_inicio', dia(weekEnd))
      .gte('periodo_fim', dia(weekStart)),
  ]);
  return {
    uberDrivers: linhas(uberDrivers) as UberDriverRow[],
    combustivel: [...linhas(bp), ...linhas(repsol), ...linhas(edp)] as TransacaoMotoristaRow[],
    portagens: linhas(viaVerde) as TransacaoMotoristaRow[],
    contratos: linhas(contratos) as unknown as ContratoComCondutores[],
    boltResumos: linhas(boltResumos) as BoltResumoRow[],
  };
}

type ChamarRpc = (
  fn: string,
  args: Record<string, unknown>
) => Promise<{ data: Record<string, unknown[]> | null; error: unknown }>;

/** Ficha: só as linhas deste motorista, pela função resumo_semana_motorista_ficha. */
async function carregarFechadosDoMotorista(
  motoristaId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<DadosFechados> {
  // types.ts ainda não tem a função: regenera-se depois de aplicada a migração 20261127120000.
  const rpc = supabase.rpc.bind(supabase) as unknown as ChamarRpc;
  const { data, error } = await rpc('resumo_semana_motorista_ficha', {
    p_motorista_id: motoristaId,
    p_inicio: dia(weekStart),
    p_fim: dia(weekEnd),
  });
  // Sem estas linhas a conta dava Bolt, combustível e aluguer a 0 €: falha à vista.
  if (error) throw error;
  return {
    boltResumos: (data?.bolt_resumos ?? []) as BoltResumoRow[],
    uberDrivers: (data?.uber_drivers ?? []) as UberDriverRow[],
    combustivel: (data?.combustivel ?? []) as TransacaoMotoristaRow[],
    portagens: (data?.portagens ?? []) as TransacaoMotoristaRow[],
    contratos: (data?.contratos ?? []) as ContratoComCondutores[],
  };
}

/**
 * Linhas para calcularResumosSemana. Com `motoristaId` (ficha) as tabelas do
 * Financeiro e dos contratos vêm pela função no servidor, só desse motorista.
 */
export async function carregarDadosResumoSemana(
  weekStart: Date,
  weekEnd: Date,
  motoristaId?: string
): Promise<DadosResumoSemana> {
  const [abertos, fechados] = await Promise.all([
    carregarAbertos(weekStart, weekEnd),
    motoristaId
      ? carregarFechadosDoMotorista(motoristaId, weekStart, weekEnd)
      : carregarFechadosDaOrg(weekStart, weekEnd),
  ]);
  return { ...abertos, ...fechados };
}
