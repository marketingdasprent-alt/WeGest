import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RentingGrupoMin {
  id: string;
  nome: string;
}

export interface RentingTarifaMin {
  id: string;
  grupo_id: string;
  nome: string;
  tipo: string;
  kms_incluidos: number | null;
  km_adicional_valor: number | null;
  preco_dia: number | null;
  preco_semana: number | null;
  preco_mes: number | null;
}

export interface RentingTarifaPrecoModelo {
  tarifa_id: string;
  modelo_id: string;
  preco_semana: number | null;
  preco_dia: number | null;
  preco_mes: number | null;
  km_mensal: number | null;
  km_adicional_valor: number | null;
  franquia_valor: number | null;
  caucao_valor: number | null;
  km_mensal_iva: number | null;
  km_adicional_valor_iva: number | null;
  franquia_valor_iva: number | null;
  caucao_valor_iva: number | null;
}

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
  valor: number;
  modo: 'Diário' | 'Mensal' | 'Semanal';
  descricao: string;
  semanalCondutor: number | null;
}

export interface CalculoBaseAluguerRentingInput {
  regime: string;
  isLongaDuracao: boolean;
  dias: number | null;
  tarifa: Pick<RentingTarifaMin, 'preco_dia' | 'preco_semana' | 'preco_mes'> | null;
  valorTotalManual?: number | null;
  precoModeloSemana?: number | null;
  precoModeloDia?: number | null;
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

  // `null` segue a tarifa; 0 é uma sobreposição manual válida.
  if (valorTotalManual != null) return valorTotalManual;

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
    if (precoModeloSemana == null) return null;
    return {
      valor: Number(precoModeloSemana.toFixed(2)),
      modo: 'Semanal',
      descricao: 'Preço semanal do modelo · renova a cada semana',
      semanalCondutor: precoModeloSemana,
    };
  }

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

// `null` preserva o valor manual quando a nova combinação não tem preço.
export function resolverValorTotalManualAoMudarTarifa(
  regime: string,
  isLongaDuracao: boolean,
  dias: number | null,
  tarifaNova: Pick<RentingTarifaMin, 'preco_dia' | 'preco_semana' | 'preco_mes'> | null,
  precoModeloSemana: number | null,
  precoModeloDia: number | null,
  precoModeloMes: number | null
): number | null {
  if (regime === 'slot' || !tarifaNova) return null;
  const fat = calcularFaturacaoRenting(
    regime,
    isLongaDuracao,
    dias,
    tarifaNova,
    precoModeloSemana,
    precoModeloDia,
    precoModeloMes
  );
  return fat?.valor ?? null;
}
