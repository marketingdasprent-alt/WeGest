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
  id: string;
  grupo_id: string;
  nome: string;
  tipo: string; // 'renting' | 'tvde'
  kms_incluidos: number | null;
  km_adicional_valor: number | null;
  preco_dia: number | null;
  preco_semana: number | null;
  preco_mes: number | null;
}

/** Preço semanal por modelo, específico de uma tarifa TVDE. */
export interface RentingTarifaPrecoModelo {
  tarifa_id: string;
  modelo_id: string;
  preco_semana: number;
  km_mensal: number | null;
  km_adicional_valor: number | null;
  franquia_valor: number | null;
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
          'id, grupo_id, nome, tipo, kms_incluidos, km_adicional_valor, preco_dia, preco_semana, preco_mes'
        )
        .eq('ativa', true);
      if (error) throw error;
      return (data ?? []) as RentingTarifaMin[];
    },
    staleTime: 60_000,
  });
}

/** Preços por modelo de todas as tarifas TVDE activas da org. */
export function useRentingTarifaPrecosModelo() {
  return useQuery({
    queryKey: ['renting_tarifa_precos_modelo_min'],
    queryFn: async (): Promise<RentingTarifaPrecoModelo[]> => {
      const { data, error } = await supabase
        .from('renting_tarifa_precos_modelo')
        .select('tarifa_id, modelo_id, preco_semana, km_mensal, km_adicional_valor, franquia_valor');
      if (error) throw error;
      return (data ?? []) as RentingTarifaPrecoModelo[];
    },
    staleTime: 60_000,
  });
}

export interface FaturacaoRenting {
  valor: number; // valor faturado ao cliente
  modo: 'Diário' | 'Mensal' | 'Semanal';
  descricao: string;
  semanalCondutor: number | null; // preço/semana atribuído ao condutor (só TVDE)
}

/**
 * Valor a faturar ao cliente a partir da tarifa do grupo:
 *   TVDE              → semanal, preço POR MODELO da viatura (precoModeloSemana)
 *   ALD (longa dur.)  → mensal (preço/mês, período travado em 30 dias)
 *   Rent-a-Car normal → diário (nº dias × preço/dia)
 *
 * No TVDE o preço é definido por modelo na tarifa (renting_tarifa_precos_modelo).
 * Se a viatura for de um modelo sem preço nessa tarifa, devolve null — a UI
 * bloqueia + avisa. `precoModeloSemana` é o preço/semana do modelo da viatura
 * na tarifa escolhida (ou null se não configurado).
 *
 * Partilhado por reserva e contrato — ao trocar de viatura ambos recalculam.
 * Devolve null se a tarifa não cobrir o regime.
 */
export interface CalculoBaseAluguerRentingInput {
  regime: string;
  isLongaDuracao: boolean;
  dias: number | null;
  tarifa: Pick<RentingTarifaMin, 'preco_dia' | 'preco_semana' | 'preco_mes'> | null;
  valorTotalManual?: number | null;
  precoModeloSemana?: number | null;
}

export function calcularBaseAluguerRenting(input: CalculoBaseAluguerRentingInput): number | null {
  const { regime, isLongaDuracao, dias, tarifa, valorTotalManual, precoModeloSemana } = input;

  if (valorTotalManual != null && valorTotalManual > 0) return valorTotalManual;

  if (regime === 'tvde') {
    return precoModeloSemana ?? null;
  }

  if (isLongaDuracao) {
    if (!tarifa?.preco_mes) return null;
    return tarifa.preco_mes;
  }

  if (dias == null || dias <= 0 || tarifa?.preco_dia == null) return null;
  return tarifa.preco_dia * dias;
}

export function calcularFaturacaoRenting(
  regime: string,
  isLongaDuracao: boolean,
  dias: number | null,
  tarifa: Pick<RentingTarifaMin, 'preco_dia' | 'preco_semana' | 'preco_mes'> | null,
  precoModeloSemana?: number | null
): FaturacaoRenting | null {
  if (!tarifa) return null;

  if (regime === 'tvde') {
    // TVDE cobra por semana, com preço específico do modelo da viatura.
    if (precoModeloSemana == null) return null; // modelo sem preço nesta tarifa → bloqueia
    return {
      valor: Number(precoModeloSemana.toFixed(2)),
      modo: 'Semanal',
      descricao: 'Preço semanal do modelo · renova a cada semana',
      semanalCondutor: precoModeloSemana,
    };
  }

  if (isLongaDuracao) {
    if (tarifa.preco_mes == null) return null;
    return {
      valor: Number(tarifa.preco_mes.toFixed(2)),
      modo: 'Mensal',
      descricao: '30 dias · renova a cada mês',
      semanalCondutor: null,
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
