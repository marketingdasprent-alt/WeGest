import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Grupos e tarifas de renting em forma mínima, partilhados pela reserva e pelo
 * contrato. Mantém as queryKeys 'renting_grupos_min'/'renting_tarifas_min' para
 * reaproveitar o cache já populado pelo formulário de reserva.
 *
 * Ao escolher uma viatura, ambos os formulários derivam o `grupo` (nome) e a
 * tarifa aplicável (do grupo_id da viatura) — ver `aplicarDadosViatura`.
 */

export interface RentingGrupoMin {
  id: string;
  nome: string;
}

export interface RentingTarifaMin {
  grupo_id: string;
  nome: string;
  kms_incluidos: number | null;
  km_adicional_valor: number | null;
  preco_dia: number | null;
  preco_semana: number | null;
  preco_mes: number | null;
}

/** Grupos de renting activos (id + nome). */
export function useRentingGruposMin() {
  return useQuery({
    queryKey: ['renting_grupos_min'],
    queryFn: async (): Promise<RentingGrupoMin[]> => {
      const { data, error } = await supabase
        .from('renting_grupos')
        .select('id, nome')
        .eq('ativo', true);
      if (error) throw error;
      return (data ?? []) as RentingGrupoMin[];
    },
    staleTime: 60_000,
  });
}

/** Tarifas de renting activas (por grupo). */
export function useRentingTarifasMin() {
  return useQuery({
    queryKey: ['renting_tarifas_min'],
    queryFn: async (): Promise<RentingTarifaMin[]> => {
      const { data, error } = await supabase
        .from('renting_tarifas')
        .select(
          'grupo_id, nome, kms_incluidos, km_adicional_valor, preco_dia, preco_semana, preco_mes'
        )
        .eq('ativa', true);
      if (error) throw error;
      return (data ?? []) as RentingTarifaMin[];
    },
    staleTime: 60_000,
  });
}

export interface FaturacaoRenting {
  valor: number; // valor faturado ao cliente
  modo: 'Diário' | 'Mensal';
  descricao: string;
  semanalCondutor: number | null; // preço/semana atribuído ao condutor (só TVDE)
}

/**
 * Valor a faturar ao cliente a partir da tarifa do grupo:
 *   TVDE ou ALD       → mensal (preço/mês, período travado em 30 dias)
 *   Rent-a-Car normal → diário (nº dias × preço/dia)
 * No TVDE, o preço/semana vai para a conta-corrente do condutor.
 *
 * Partilhado por reserva e contrato — ao trocar de viatura ambos recalculam o
 * valor do novo grupo (a reserva grava em valor_total; o contrato em
 * valor_total_manual). Devolve null se a tarifa não cobrir o regime.
 */
export function calcularFaturacaoRenting(
  regime: string,
  isLongaDuracao: boolean,
  dias: number | null,
  tarifa: Pick<RentingTarifaMin, 'preco_dia' | 'preco_semana' | 'preco_mes'> | null
): FaturacaoRenting | null {
  if (!tarifa) return null;

  if (regime === 'tvde' || isLongaDuracao) {
    if (tarifa.preco_mes == null) return null;
    return {
      valor: Number(tarifa.preco_mes.toFixed(2)),
      modo: 'Mensal',
      descricao: '30 dias · renova a cada mês',
      semanalCondutor: regime === 'tvde' ? tarifa.preco_semana : null,
    };
  }

  if (dias == null || dias <= 0 || tarifa.preco_dia == null) return null;
  return {
    valor: Number((dias * tarifa.preco_dia).toFixed(2)),
    modo: 'Diário',
    descricao: `${dias} dia(s) × ${tarifa.preco_dia} €`,
    semanalCondutor: null,
  };
}
