// Ocupação atual das viaturas (sem depender do RPC de disponibilidade unificada).
// Consulta diretamente as fontes que ocupam uma viatura e devolve, por viatura,
// o conjunto de fontes ativas. Usado para derivar o estado (em reserva / em
// contrato / em movimentação / manutenção) na listagem da Frota.
//
// "Ativo" = qualquer registo cujo estado ainda não terminou, mesmo que o período
// comece no futuro (uma reserva/contrato agendado já conta como ocupação).
//
// "Contrato" = contratos_renting (módulo de renting). Os contratos de prestação
// de serviços (tabela `contratos`) NÃO ocupam viatura para efeitos de frota.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type OcupacaoFonte = 'reserva' | 'contrato' | 'movimento' | 'reparacao';

/**
 * Consulta as fontes que ocupam uma viatura (reserva / contrato / movimento /
 * reparação) e devolve, por viatura, o conjunto de fontes ativas.
 * Função autónoma (sem React) para poder ser reutilizada fora de componentes.
 */
export async function fetchViaturasOcupacao(): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  const add = (id: string | null | undefined, fonte: OcupacaoFonte) => {
    if (!id) return;
    let set = map.get(id);
    if (!set) {
      set = new Set<string>();
      map.set(id, set);
    }
    set.add(fonte);
  };

  const [reservas, contratos, movimentos, reparacoes] = await Promise.all([
    // Reservas: excluir as soft-deleted (deleted_at) — uma reserva eliminada
    // não deve ocupar a viatura, tal como já não aparece na lista de Reservas.
    supabase
      .from('reservas')
      .select('viatura_id')
      .is('deleted_at', null)
      .not('viatura_id', 'is', null)
      .in('estado', ['pendente', 'confirmada', 'em_curso']),
    // Contratos do módulo de renting (NÃO os de prestação de serviços da
    // tabela `contratos`).
    supabase
      .from('contratos_renting')
      .select('viatura_id')
      .is('deleted_at', null)
      .not('viatura_id', 'is', null)
      .in('estado_operacional', ['agendado', 'em_curso']),
    supabase
      .from('movimentos')
      .select('viatura_id')
      .not('viatura_id', 'is', null)
      .in('estado', ['planeado', 'a_decorrer']),
    supabase
      .from('viatura_reparacoes')
      .select('viatura_id')
      .not('viatura_id', 'is', null)
      .not('data_entrada', 'is', null)
      .is('data_saida', null),
  ]);

  (reservas.data ?? []).forEach((r: { viatura_id: string | null }) => add(r.viatura_id, 'reserva'));
  (contratos.data ?? []).forEach((r: { viatura_id: string | null }) =>
    add(r.viatura_id, 'contrato')
  );
  (movimentos.data ?? []).forEach((r: { viatura_id: string | null }) =>
    add(r.viatura_id, 'movimento')
  );
  (reparacoes.data ?? []).forEach((r: { viatura_id: string | null }) =>
    add(r.viatura_id, 'reparacao')
  );

  return map;
}

export function useViaturasOcupacao(enabled = true) {
  return useQuery({
    queryKey: ['viaturas-ocupacao-atual'],
    enabled,
    staleTime: 30_000,
    queryFn: fetchViaturasOcupacao,
  });
}
