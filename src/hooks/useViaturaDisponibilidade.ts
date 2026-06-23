// Disponibilidade unificada de viaturas — wrapper React Query das
// RPCs `viatura_ocupacao_intervalos`, `viatura_conflitos_no_intervalo`
// e `viaturas_com_disponibilidade` (ver migration
// 20260527000001_viatura_disponibilidade_unificada.sql).
//
// As RPCs ainda não estão nos tipos gerados do Supabase. Usamos o
// mesmo padrão de cast `supabase.rpc as unknown as ...` já existente
// em `useContratos.ts` para fns recentes.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ============================================================
// Tipos
// ============================================================

export type ViaturaOcupacaoFonte = 'contrato' | 'reserva' | 'movimento' | 'reparacao';

export interface ViaturaOcupacaoRow {
  fonte: ViaturaOcupacaoFonte;
  fonte_id: string;
  codigo: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  estado: string | null;
  tipo: string | null;
  descricao: string;
}

/** Conflito como vem dentro do array JSON de `viaturas_com_disponibilidade`. */
export interface ViaturaConflitoJson {
  fonte: ViaturaOcupacaoFonte;
  fonte_id: string;
  codigo?: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  estado?: string | null;
  tipo?: string | null;
  descricao: string;
}

export interface ViaturaDisponibilidadeRow {
  viatura_id: string;
  disponivel: boolean;
  conflitos: ViaturaConflitoJson[];
}

// ============================================================
// Helper para chamar RPCs ainda não nos tipos gerados
// ============================================================

type UntypedRpc = <T = unknown>(
  fn: string,
  params: Record<string, unknown>
) => Promise<{ data: T | null; error: { message: string } | null }>;

const rpc = supabase.rpc as unknown as UntypedRpc;

// ============================================================
// 1. useViaturaOcupacao — timeline de UMA viatura
// ============================================================

export interface UseViaturaOcupacaoArgs {
  viaturaId: string | null | undefined;
  /** Janela opcional. Omitir = toda a timeline futura/passada. */
  from?: Date | string | null;
  to?: Date | string | null;
  enabled?: boolean;
}

const toIso = (v: Date | string | null | undefined): string | null => {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString();
  return v;
};

export function useViaturaOcupacao({
  viaturaId,
  from = null,
  to = null,
  enabled = true,
}: UseViaturaOcupacaoArgs) {
  const fromIso = toIso(from);
  const toIso2 = toIso(to);

  return useQuery({
    queryKey: ['viatura-ocupacao', viaturaId, fromIso, toIso2],
    enabled: enabled && !!viaturaId,
    queryFn: async (): Promise<ViaturaOcupacaoRow[]> => {
      const { data, error } = await rpc<ViaturaOcupacaoRow[]>('viatura_ocupacao_intervalos', {
        p_viatura_id: viaturaId,
        p_from: fromIso,
        p_to: toIso2,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

// ============================================================
// 2. useViaturaConflitos — conflitos no intervalo (com exclusão)
// ============================================================

export interface UseViaturaConflitosArgs {
  viaturaId: string | null | undefined;
  dataInicio: Date | string | null | undefined;
  dataFim: Date | string | null | undefined;
  excluirContratoId?: string | null;
  excluirReservaId?: string | null;
  excluirMovimentoId?: string | null;
  excluirReparacaoId?: string | null;
  enabled?: boolean;
}

export function useViaturaConflitos({
  viaturaId,
  dataInicio,
  dataFim,
  excluirContratoId = null,
  excluirReservaId = null,
  excluirMovimentoId = null,
  excluirReparacaoId = null,
  enabled = true,
}: UseViaturaConflitosArgs) {
  const inicioIso = toIso(dataInicio);
  const fimIso = toIso(dataFim);

  const isReady =
    !!viaturaId &&
    !!inicioIso &&
    !!fimIso &&
    new Date(fimIso).getTime() > new Date(inicioIso).getTime();

  return useQuery({
    queryKey: [
      'viatura-conflitos',
      viaturaId,
      inicioIso,
      fimIso,
      excluirContratoId,
      excluirReservaId,
      excluirMovimentoId,
      excluirReparacaoId,
    ],
    enabled: enabled && isReady,
    queryFn: async (): Promise<ViaturaOcupacaoRow[]> => {
      const { data, error } = await rpc<ViaturaOcupacaoRow[]>('viatura_conflitos_no_intervalo', {
        p_viatura_id: viaturaId,
        p_data_inicio: inicioIso,
        p_data_fim: fimIso,
        p_excluir_contrato_id: excluirContratoId,
        p_excluir_reserva_id: excluirReservaId,
        p_excluir_movimento_id: excluirMovimentoId,
        p_excluir_reparacao_id: excluirReparacaoId,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

// ============================================================
// 3. useViaturasComDisponibilidade — função-mãe para seletores
// ============================================================

export interface UseViaturasComDisponibilidadeArgs {
  dataInicio: Date | string | null | undefined;
  dataFim: Date | string | null | undefined;
  /** Override de org (admin / cross-tenant). Por defeito usa a org actual. */
  orgId?: string | null;
  enabled?: boolean;
}

export function useViaturasComDisponibilidade({
  dataInicio,
  dataFim,
  orgId = null,
  enabled = true,
}: UseViaturasComDisponibilidadeArgs) {
  const inicioIso = toIso(dataInicio);
  const fimIso = toIso(dataFim);

  const isReady =
    !!inicioIso && !!fimIso && new Date(fimIso).getTime() > new Date(inicioIso).getTime();

  return useQuery({
    queryKey: ['viaturas-com-disponibilidade', inicioIso, fimIso, orgId],
    enabled: enabled && isReady,
    queryFn: async (): Promise<ViaturaDisponibilidadeRow[]> => {
      const { data, error } = await rpc<ViaturaDisponibilidadeRow[]>(
        'viaturas_com_disponibilidade',
        {
          p_data_inicio: inicioIso,
          p_data_fim: fimIso,
          p_org_id: orgId,
        }
      );
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

// ============================================================
// Helpers de UI
// ============================================================

const FONTE_LABEL: Record<ViaturaOcupacaoFonte, string> = {
  contrato: 'Contrato',
  reserva: 'Reserva',
  movimento: 'Movimento',
  reparacao: 'Reparação',
};

export function formatConflitoCurto(c: ViaturaConflitoJson): string {
  const base = FONTE_LABEL[c.fonte] ?? c.fonte;
  const codigo = c.codigo != null ? ` #${c.codigo}` : '';
  return `${base}${codigo}`;
}

const formatRange = (ini: string | null, fim: string | null): string => {
  const fmt = (s: string | null) => {
    if (!s) return '?';
    const d = new Date(s);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };
  return `${fmt(ini)} – ${fim ? fmt(fim) : 'em curso'}`;
};

export function formatConflitoCompleto(c: ViaturaConflitoJson): string {
  return `${formatConflitoCurto(c)} · ${formatRange(c.data_inicio, c.data_fim)}`;
}
