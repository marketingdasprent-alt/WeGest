/**
 * Catálogos (dados de referência) do formulário de viatura, em cache (react-query).
 *
 * Antes eram buscados à BD com useEffect+useState em CADA montagem do separador
 * Dados — ao abrir a viatura ou trocar de aba, os <Select> ficavam ~1s vazios e
 * "a piscar" enquanto as queries voltavam. Em cache, a 1ª abertura busca uma vez
 * e as seguintes são instantâneas (sem flicker).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  ViaturaMarca,
  ViaturaModelo,
  ViaturaCombustivel,
  ViaturasTipo,
  RentingGrupo,
  Estacao,
} from '@/components/viaturas/tabs/viaturaTabDados.types';

export interface ViaturaTarifaCatalogo {
  grupo_id: string | null;
  nome: string;
  preco_dia: number | null;
  preco_semana: number | null;
  preco_mes: number | null;
  kms_incluidos: number | null;
}

export interface ViaturaTarifaTvdeModeloCatalogo {
  modelo_id: string;
  tarifa_nome: string;
  preco_semana: number;
}

export interface ViaturaTarifaRacModeloCatalogo {
  modelo_id: string;
  tarifa_nome: string;
  preco_dia: number | null;
  preco_mes: number | null;
}

// Referência vazia estável — evita re-execuções de efeitos que dependem destes
// arrays enquanto a query ainda não devolveu dados.
const EMPTY: never[] = [];

const STALE = 5 * 60 * 1000;

export function useViaturaMarcas(): ViaturaMarca[] {
  const { data } = useQuery({
    queryKey: ['viatura-catalogo', 'marcas'],
    staleTime: STALE,
    queryFn: async (): Promise<ViaturaMarca[]> => {
      const { data, error } = await supabase
        .from('viatura_marcas')
        .select('id, nome')
        .eq('ativa', true)
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
  return data ?? EMPTY;
}

export function useViaturaModelos(marcaId: string | null | undefined): ViaturaModelo[] {
  const { data } = useQuery({
    queryKey: ['viatura-catalogo', 'modelos', marcaId ?? null],
    enabled: !!marcaId,
    staleTime: STALE,
    queryFn: async (): Promise<ViaturaModelo[]> => {
      const { data, error } = await supabase
        .from('viatura_modelos')
        .select('id, nome, marca_id')
        .eq('marca_id', marcaId as string)
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return (data ?? []) as ViaturaModelo[];
    },
  });
  return data ?? EMPTY;
}

export function useViaturaCombustiveis(): ViaturaCombustivel[] {
  const { data } = useQuery({
    queryKey: ['viatura-catalogo', 'combustiveis'],
    staleTime: STALE,
    queryFn: async (): Promise<ViaturaCombustivel[]> => {
      const { data, error } = await supabase
        .from('viatura_combustiveis')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
  return data ?? EMPTY;
}

export function useViaturaTipos(): ViaturasTipo[] {
  const { data } = useQuery({
    queryKey: ['viatura-catalogo', 'tipos'],
    staleTime: STALE,
    queryFn: async (): Promise<ViaturasTipo[]> => {
      const { data, error } = await supabase
        .from('viatura_tipos')
        .select('id, nome, elegivel_tvde')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
  return data ?? EMPTY;
}

export function useViaturaGrupos(): RentingGrupo[] {
  const { data } = useQuery({
    queryKey: ['viatura-catalogo', 'grupos'],
    staleTime: STALE,
    queryFn: async (): Promise<RentingGrupo[]> => {
      const { data, error } = await supabase
        .from('renting_grupos')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
  return data ?? EMPTY;
}

export function useViaturaEstacoes(): Estacao[] {
  const { data } = useQuery({
    queryKey: ['viatura-catalogo', 'estacoes'],
    staleTime: STALE,
    queryFn: async (): Promise<Estacao[]> => {
      const { data, error } = await supabase
        .from('estacoes')
        .select('id, nome, cidade')
        .eq('ativa', true)
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
  return data ?? EMPTY;
}

export function useViaturaTarifas(): ViaturaTarifaCatalogo[] {
  const { data } = useQuery({
    queryKey: ['viatura-catalogo', 'tarifas'],
    staleTime: STALE,
    queryFn: async (): Promise<ViaturaTarifaCatalogo[]> => {
      const { data, error } = await supabase
        .from('renting_tarifas')
        .select('grupo_id, nome, preco_dia, preco_semana, preco_mes, kms_incluidos')
        .eq('ativa', true);
      if (error) throw error;
      return (data ?? []) as ViaturaTarifaCatalogo[];
    },
  });
  return data ?? EMPTY;
}

// Tarifas TVDE (renting_tarifas.tipo = 'tvde') não têm preço por grupo — o
// preço é por MODELO, em renting_tarifa_precos_modelo. Sem isto, uma viatura
// TVDE com tarifa ativa e configurada aparecia como "sem tarifa" só porque o
// grupo em si não tem preço direto.
export function useViaturaTarifasTvdeModelo(): ViaturaTarifaTvdeModeloCatalogo[] {
  const { data } = useQuery({
    queryKey: ['viatura-catalogo', 'tarifas-tvde-modelo'],
    staleTime: STALE,
    queryFn: async (): Promise<ViaturaTarifaTvdeModeloCatalogo[]> => {
      const { data, error } = await supabase
        .from('renting_tarifa_precos_modelo')
        .select('modelo_id, preco_semana, renting_tarifas!inner(tipo, ativa, nome)')
        .eq('renting_tarifas.tipo', 'tvde')
        .eq('renting_tarifas.ativa', true);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        modelo_id: r.modelo_id,
        tarifa_nome: (r.renting_tarifas as unknown as { nome: string }).nome,
        preco_semana: Number(r.preco_semana),
      }));
    },
  });
  return data ?? EMPTY;
}

// Tarifas Rent-a-Car (tipo != 'tvde') também precificam por MODELO, não por
// grupo — o preço por grupo em `renting_tarifas` (grupo_id/preco_dia/...) é um
// campo legado que já não é preenchido ao criar tarifas (RentingTarifaForm só
// tem preço por modelo). Sem isto, TODAS as viaturas apareciam como "grupo sem
// tarifa" mesmo tendo preço por modelo activo e configurado.
export function useViaturaTarifasRacModelo(): ViaturaTarifaRacModeloCatalogo[] {
  const { data } = useQuery({
    queryKey: ['viatura-catalogo', 'tarifas-rac-modelo'],
    staleTime: STALE,
    queryFn: async (): Promise<ViaturaTarifaRacModeloCatalogo[]> => {
      const { data, error } = await supabase
        .from('renting_tarifa_precos_modelo')
        .select('modelo_id, preco_dia, preco_mes, renting_tarifas!inner(tipo, ativa, nome)')
        .neq('renting_tarifas.tipo', 'tvde')
        .eq('renting_tarifas.ativa', true);
      if (error) throw error;
      return (data ?? [])
        .filter((r) => r.preco_dia != null || r.preco_mes != null)
        .map((r) => ({
          modelo_id: r.modelo_id,
          tarifa_nome: (r.renting_tarifas as unknown as { nome: string }).nome,
          preco_dia: r.preco_dia != null ? Number(r.preco_dia) : null,
          preco_mes: r.preco_mes != null ? Number(r.preco_mes) : null,
        }));
    },
  });
  return data ?? EMPTY;
}
