import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  Movimento,
  MovimentoEstado,
  MovimentoInsert,
  MovimentoTipo,
  MovimentoUpdate,
} from '@/types/movimento';

const QUERY_KEY_BASE = ['renting', 'movimentos'] as const;

const SELECT_COLUMNS = `
  id, codigo, org_id, tipo, estado,
  viatura_id, matricula,
  estacao_origem_id, estacao_destino_id,
  data_partida, data_chegada,
  colaborador_id, colaborador_nome,
  km_inicial, km_final, combustivel_inicial, combustivel_final,
  motivo, prestador, custo_estimado, custo_final,
  info, observacoes, observacoes_internas,
  created_by, created_at, updated_at
`;

export interface UseMovimentosOptions {
  tipo?: MovimentoTipo;
  estado?: MovimentoEstado;
  viaturaId?: string;
  /** Hard cap de linhas devolvidas (default 1000) */
  limit?: number;
  enabled?: boolean;
}

/** Carrega um movimento específico por ID. */
export function useMovimento(id: string | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, 'single', id ?? null],
    queryFn: async (): Promise<Movimento | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('movimentos')
        .select(SELECT_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data as Movimento | null) ?? null;
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useMovimentos(options: UseMovimentosOptions = {}) {
  const { tipo, estado, viaturaId, limit = 1000, enabled = true } = options;

  return useQuery({
    queryKey: [
      ...QUERY_KEY_BASE,
      { tipo: tipo ?? null, estado: estado ?? null, viaturaId: viaturaId ?? null, limit },
    ],
    queryFn: async (): Promise<Movimento[]> => {
      let q = supabase
        .from('movimentos')
        .select(SELECT_COLUMNS)
        .order('codigo', { ascending: false })
        .limit(limit);

      if (tipo) q = q.eq('tipo', tipo);
      if (estado) q = q.eq('estado', estado);
      if (viaturaId) q = q.eq('viatura_id', viaturaId);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Movimento[];
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled,
  });
}

// ────────────────────────────────────────────────────────────
// Mutations
// ────────────────────────────────────────────────────────────

function errorMessage(error: unknown): string {
  if (typeof console !== 'undefined') console.error('[movimentos] erro:', error);
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof err.message === 'string' && err.message.length > 0) parts.push(err.message);
    if (typeof err.details === 'string' && err.details.length > 0) parts.push(err.details);
    if (typeof err.hint === 'string' && err.hint.length > 0) parts.push(err.hint);
    if (typeof err.code === 'string' && err.code.length > 0) parts.push(`(${err.code})`);
    if (parts.length > 0) return parts.join(' · ');
    try {
      return JSON.stringify(error);
    } catch {
      // fall-through
    }
  }
  return 'Erro inesperado';
}

/** Invalida movimentos + viaturas (o trigger de sync pode ter mexido na viatura). */
function invalidarTudo(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
  qc.invalidateQueries({ queryKey: ['viaturas'] });
}

export function useCreateMovimento() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: MovimentoInsert): Promise<Movimento> => {
      const { data, error } = await supabase
        .from('movimentos')
        // `codigo` é gerado pelo trigger `gen_movimento_codigo` (BEFORE INSERT)
        // mas os types Supabase marcam-no como obrigatório — placeholder 0
        // dispara o trigger a calcular o real.
        .insert({ ...payload, codigo: 0 })
        .select(SELECT_COLUMNS)
        .single();
      if (error) throw error;
      return data as Movimento;
    },
    onSuccess: () => {
      invalidarTudo(qc);
      toast({ title: 'Movimento criado', description: 'O movimento foi registado com sucesso.' });
    },
    onError: (error: unknown) => {
      toast({ title: 'Erro', description: errorMessage(error), variant: 'destructive' });
    },
  });
}

export function useUpdateMovimento() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...patch }: MovimentoUpdate & { id: string }): Promise<Movimento> => {
      const { data, error } = await supabase
        .from('movimentos')
        .update(patch)
        .eq('id', id)
        .select(SELECT_COLUMNS)
        .single();
      if (error) throw error;
      return data as Movimento;
    },
    onSuccess: () => {
      invalidarTudo(qc);
      toast({ title: 'Movimento atualizado', description: 'As alterações foram guardadas.' });
    },
    onError: (error: unknown) => {
      toast({ title: 'Erro', description: errorMessage(error), variant: 'destructive' });
    },
  });
}

export function useDeleteMovimento() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('movimentos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarTudo(qc);
      toast({ title: 'Movimento eliminado', description: 'O movimento foi removido.' });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Erro ao eliminar',
        description: errorMessage(error),
        variant: 'destructive',
      });
    },
  });
}
