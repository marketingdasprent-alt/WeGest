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

/**
 * Preço por modelo, específico de uma tarifa. Consoante o tipo da tarifa:
 *   TVDE       → usa preco_semana (+ km_mensal/km_adicional_valor/franquia_valor)
 *   Rent-a-Car → usa preco_dia/preco_mes/km_mensal (+ km_adicional_valor_iva/franquia_valor_iva)
 * Os campos de km incluídos (km_mensal), km extra e franquia são copiados para
 * o contrato/reserva ao escolher a tarifa+viatura.
 */
export interface RentingTarifaPrecoModelo {
  tarifa_id: string;
  modelo_id: string;
  preco_semana: number | null;
  preco_dia: number | null;
  preco_mes: number | null;
  // TVDE: km incluídos/mês, km extra, franquia e caução
  km_mensal: number | null;
  km_adicional_valor: number | null;
  franquia_valor: number | null;
  caucao_valor: number | null;
  // Rent-a-Car: km incluídos/mês, km extra, franquia e caução (c/IVA) — independentes do TVDE
  km_mensal_iva: number | null;
  km_adicional_valor_iva: number | null;
  franquia_valor_iva: number | null;
  caucao_valor_iva: number | null;
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

/** Preços por modelo de todas as tarifas (TVDE e Rent-a-Car) activas da org. */
export function useRentingTarifaPrecosModelo() {
  return useQuery({
    queryKey: ['renting_tarifa_precos_modelo_min'],
    queryFn: async (): Promise<RentingTarifaPrecoModelo[]> => {
      const { data, error } = await supabase
        .from('renting_tarifa_precos_modelo')
        .select(
          'tarifa_id, modelo_id, preco_semana, preco_dia, preco_mes, km_mensal, km_adicional_valor, franquia_valor, caucao_valor, km_mensal_iva, km_adicional_valor_iva, franquia_valor_iva, caucao_valor_iva'
        );
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
 * Valor a faturar ao cliente a partir da tarifa:
 *   TVDE              → semanal, preço POR MODELO da viatura (precoModeloSemana)
 *   ALD (longa dur.)  → mensal, preço/mês POR MODELO (precoModeloMes) com
 *                       fallback ao preço/mês do grupo
 *   Rent-a-Car normal → diário, preço/dia POR MODELO (precoModeloDia) com
 *                       fallback ao preço/dia do grupo
 *
 * Tanto TVDE como Rent-a-Car definem o preço por modelo na tarifa
 * (renting_tarifa_precos_modelo). No TVDE, se o modelo não tiver preço,
 * devolve null e a UI bloqueia + avisa. No Rent-a-Car, se o modelo não
 * tiver preço, recai no preço do grupo (tarifa.preco_dia/preco_mes) para
 * não quebrar contratos/grupos existentes.
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
  /** Preço/dia s/IVA do modelo na tarifa Rent-a-Car (tem prioridade sobre o grupo). */
  precoModeloDia?: number | null;
  /** Preço/mês s/IVA do modelo na tarifa Rent-a-Car (tem prioridade sobre o grupo). */
  precoModeloMes?: number | null;
}

export function calcularBaseAluguerRenting(input: CalculoBaseAluguerRentingInput): number | null {
  const {
    regime,
    isLongaDuracao,
    dias,
    tarifa,
    valorTotalManual,
    precoModeloSemana,
    precoModeloDia,
    precoModeloMes,
  } = input;

  if (valorTotalManual != null && valorTotalManual > 0) return valorTotalManual;

  if (regime === 'tvde') {
    return precoModeloSemana ?? null;
  }

  if (isLongaDuracao) {
    const mes = precoModeloMes ?? tarifa?.preco_mes ?? null;
    return mes;
  }

  const dia = precoModeloDia ?? tarifa?.preco_dia ?? null;
  if (dias == null || dias <= 0 || dia == null) return null;
  return dia * dias;
}

export function calcularFaturacaoRenting(
  regime: string,
  isLongaDuracao: boolean,
  dias: number | null,
  tarifa: Pick<RentingTarifaMin, 'preco_dia' | 'preco_semana' | 'preco_mes'> | null,
  precoModeloSemana?: number | null,
  precoModeloDia?: number | null,
  precoModeloMes?: number | null
): FaturacaoRenting | null {
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

  // Rent-a-Car: preço por modelo da tarifa tem prioridade; recai no grupo.
  if (isLongaDuracao) {
    const mes = precoModeloMes ?? tarifa?.preco_mes ?? null;
    if (mes == null) return null;
    return {
      valor: Number(mes.toFixed(2)),
      modo: 'Mensal',
      descricao: '30 dias · renova a cada mês',
      semanalCondutor: null,
    };
  }

  const dia = precoModeloDia ?? tarifa?.preco_dia ?? null;
  if (dias == null || dias <= 0 || dia == null) return null;
  return {
    valor: Number((dias * dia).toFixed(2)),
    modo: 'Diário',
    descricao: `${dias} dia(s) × ${dia} €`,
    semanalCondutor: null,
  };
}
