// Leituras do ecrã "Início" da frota. Vivem aqui, e não no componente, porque
// `supabase.from()` em components/pages é erro de lint (ver eslint.config.js):
// enquanto isto era src/pages/Dashboard.tsx estava na lista de isentos, mas
// essa lista é grandfathering de código antigo — um ficheiro refactorado
// cumpre a regra.
//
// São funções simples, não hooks: o componente já tem o seu próprio ciclo de
// carregamento (primeira carga vs refresh) e o que lhe faltava era só tirar as
// queries de dentro dele.
import { supabase } from '@/integrations/supabase/client';

export interface ViaturaFrota {
  id: string;
  status: string | null;
  is_slot: boolean | null;
  is_vendida: boolean | null;
  matricula: string | null;
  valor_aluguer: number | null;
}

/** Frota completa (incluindo vendidas — quem filtra é quem chama). */
export async function fetchViaturasFrota() {
  const { data } = await supabase
    .from('viaturas')
    .select('id, status, is_slot, is_vendida, matricula, valor_aluguer');
  return (data ?? []) as ViaturaFrota[];
}

/**
 * As quatro leituras que alimentam os alertas e o gráfico. Independentes entre
 * si, por isso vão juntas num Promise.all em vez de em cascata.
 *
 * @param extintorLimite `yyyy-MM-dd` — data até à qual um extintor conta como
 *   a expirar.
 * @param eventosDe/@param eventosAte  intervalo do gráfico de atividade, em ISO.
 */
export async function fetchAlertasFrota(
  extintorLimite: string,
  eventosDe: string,
  eventosAte: string
) {
  const [
    { data: extintoresData },
    { data: contratosAtivos, error: contratosErr },
    { count: pendentes },
    { data: eventosMesData },
  ] = await Promise.all([
    supabase
      .from('viaturas')
      .select(
        `
          id,
          matricula,
          extintor_validade,
          motorista_viaturas(
            status,
            motoristas_ativos(nome)
          )
        `
      )
      .not('extintor_validade', 'is', null)
      .lte('extintor_validade', extintorLimite)
      .order('extintor_validade', { ascending: true }),
    supabase
      .from('contratos')
      .select(
        'id, numero_contrato, data_inicio, data_fim, duracao_meses, motorista_nome, motorista_id, viatura_id, viaturas:viatura_id(matricula)'
      )
      .eq('status', 'ativo')
      .not('data_inicio', 'is', null),
    supabase
      .from('motorista_candidaturas')
      .select('id', { count: 'exact', head: true })
      .in('status', ['submetido', 'em_analise']),
    supabase
      .from('calendario_eventos')
      .select('tipo, data_inicio, titulo')
      .in('tipo', ['entrega', 'devolucao', 'recolha'])
      .gte('data_inicio', eventosDe)
      .lte('data_inicio', eventosAte),
  ]);

  return { extintoresData, contratosAtivos, contratosErr, pendentes, eventosMesData };
}
