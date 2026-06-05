import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { TablesInsert } from '@/integrations/supabase/types';
import type { Reserva, ReservaEstado, ReservaInsert, ReservaUpdate } from '@/types/reserva';

const QUERY_KEY_BASE = ['renting', 'reservas'] as const;

export interface UseReservasOptions {
  /** Filtra reservas que tocam no intervalo [from, to). Omitir = sem filtro de data */
  from?: Date;
  to?: Date;
  estado?: ReservaEstado;
  viaturaId?: string;
  /** Hard cap de linhas devolvidas (default 1000) */
  limit?: number;
  enabled?: boolean;
}

const SELECT_COLUMNS = `
  id, codigo, viatura_id, matricula, grupo,
  estacao_entrega_id, estacao_recolha_id,
  data_inicio, data_fim,
  cliente_id, cliente_nome,
  condutor_id, condutor_nome,
  estado, regime, slot_valor_semanal, valor_total,
  observacoes, observacoes_internas,
  is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias,
  franquia_valor, caucao_valor, kms_incluidos, km_adicional_valor,
  deleted_at, created_by, updated_by, created_at, updated_at
`;

/** Carrega uma reserva específica por ID (não soft-deleted). */
export function useReserva(id: string | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, 'single', id ?? null],
    queryFn: async (): Promise<Reserva | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('reservas')
        .select(SELECT_COLUMNS)
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      return (data as Reserva | null) ?? null;
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useReservas(options: UseReservasOptions = {}) {
  const { from, to, estado, viaturaId, limit = 1000, enabled = true } = options;

  return useQuery({
    queryKey: [
      ...QUERY_KEY_BASE,
      {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
        estado: estado ?? null,
        viaturaId: viaturaId ?? null,
        limit,
      },
    ],
    queryFn: async (): Promise<Reserva[]> => {
      let q = supabase
        .from('reservas')
        .select(SELECT_COLUMNS)
        .is('deleted_at', null)
        .order('data_inicio', { ascending: true })
        .limit(limit);

      // Reservas que intersectam o período visível: data_inicio < to AND data_fim > from
      if (to) q = q.lt('data_inicio', to.toISOString());
      if (from) q = q.gt('data_fim', from.toISOString());
      if (estado) q = q.eq('estado', estado);
      if (viaturaId) q = q.eq('viatura_id', viaturaId);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Reserva[];
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled,
  });
}

// ────────────────────────────────────────────────────────────
// Helpers de erro — identificar overbooking (SQLSTATE 23P01)
// ────────────────────────────────────────────────────────────

function isOverbookingError(error: unknown): boolean {
  if (!error) return false;
  const code = (error as { code?: string }).code;
  if (code === '23P01') return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('reservas_no_overbooking');
}

function reservaErrorMessage(error: unknown): { title: string; description: string } {
  if (isOverbookingError(error)) {
    return {
      title: 'Conflito de reserva',
      description: 'Já existe uma reserva activa para esta viatura no período seleccionado.',
    };
  }
  const description = error instanceof Error ? error.message : 'Erro inesperado';
  return { title: 'Erro', description };
}

// ────────────────────────────────────────────────────────────
// Mutations
// ────────────────────────────────────────────────────────────

export function useCreateReserva() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: ReservaInsert): Promise<Reserva> => {
      // org_id é preenchido por trigger na BD — daí o cast.
      const { data, error } = await supabase
        .from('reservas')
        .insert(payload as TablesInsert<'reservas'>)
        .select(SELECT_COLUMNS)
        .single();
      if (error) throw error;
      return data as Reserva;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      toast({ title: 'Reserva criada', description: 'A reserva foi criada com sucesso.' });
    },
    onError: (error: unknown) => {
      const { title, description } = reservaErrorMessage(error);
      toast({ title, description, variant: 'destructive' });
    },
  });
}

export function useUpdateReserva() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...patch }: ReservaUpdate & { id: string }): Promise<Reserva> => {
      const { data, error } = await supabase
        .from('reservas')
        .update(patch)
        .eq('id', id)
        .select(SELECT_COLUMNS)
        .single();
      if (error) throw error;
      return data as Reserva;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      toast({ title: 'Reserva actualizada', description: 'As alterações foram guardadas.' });
    },
    onError: (error: unknown) => {
      const { title, description } = reservaErrorMessage(error);
      toast({ title, description, variant: 'destructive' });
    },
  });
}

/** Soft delete — marca deleted_at. Hard delete fica para admin via DB. */
export function useDeleteReserva() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('reservas')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      toast({ title: 'Reserva eliminada', description: 'A reserva foi removida.' });
    },
    onError: (error: unknown) => {
      const description = error instanceof Error ? error.message : 'Erro inesperado';
      toast({ title: 'Erro ao eliminar', description, variant: 'destructive' });
    },
  });
}

// ────────────────────────────────────────────────────────────
// useReservaConflito — pré-check de UX (não autoritativo)
// O gate real é o EXCLUDE constraint na BD.
// ────────────────────────────────────────────────────────────

export interface UseReservaConflitoArgs {
  viaturaId: string | null | undefined;
  dataInicio: Date | null | undefined;
  dataFim: Date | null | undefined;
  excluirId?: string | null;
}

export function useReservaConflito(args: UseReservaConflitoArgs) {
  const { viaturaId, dataInicio, dataFim, excluirId } = args;

  const enabled =
    !!viaturaId && !!dataInicio && !!dataFim && dataFim.getTime() > dataInicio.getTime();

  return useQuery({
    queryKey: [
      'renting',
      'reservas',
      'conflito',
      viaturaId ?? null,
      dataInicio?.toISOString() ?? null,
      dataFim?.toISOString() ?? null,
      excluirId ?? null,
    ],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('reserva_tem_conflito', {
        p_viatura_id: viaturaId!,
        p_data_inicio: dataInicio!.toISOString(),
        p_data_fim: dataFim!.toISOString(),
        p_excluir_id: excluirId ?? null,
      });
      if (error) throw error;
      return Boolean(data);
    },
    enabled,
    staleTime: 10_000,
  });
}
