import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables } from '@/integrations/supabase/types';

type Notificacao = Tables<'notificacoes'>;

const QUERY_KEY_BASE = ['notificacoes'] as const;

// ────────────────────────────────────────────────────────────
// Interface de opções para listagem
// ────────────────────────────────────────────────────────────

export interface UseNotificationsOptions {
  /** Apenas notificações não resolvidas (padrão: true) */
  apenasNaoResolvidas?: boolean;
  /** Página actual (1-based, padrão: 1) */
  page?: number;
  /** Itens por página (padrão: 20, máx: 100) */
  limit?: number;
  /** Se false, a query não é executada */
  enabled?: boolean;
}

// ────────────────────────────────────────────────────────────
// Hook de leitura — lista paginada de notificações
// ────────────────────────────────────────────────────────────

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { apenasNaoResolvidas = true, page = 1, limit = 20, enabled = true } = options;

  const clampedLimit = Math.min(limit, 100);
  const from = (page - 1) * clampedLimit;
  const to = from + clampedLimit - 1;

  return useQuery({
    queryKey: [...QUERY_KEY_BASE, { apenasNaoResolvidas, page, limit: clampedLimit }],
    queryFn: async () => {
      let q = supabase
        .from('notificacoes')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (apenasNaoResolvidas) {
        q = q.eq('resolvida', false);
      }

      const { data, error, count } = await q;
      if (error) throw error;

      return {
        data: (data ?? []) as Notificacao[],
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / clampedLimit),
        page,
      };
    },
    enabled,
    staleTime: 30_000,
  });
}

// ────────────────────────────────────────────────────────────
// Mutation: marcar notificação como resolvida (via RPC)
// ────────────────────────────────────────────────────────────

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('resolver_notificacao', {
        p_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Erro inesperado';
      toast({
        title: 'Erro ao resolver notificação',
        description: message,
        variant: 'destructive',
      });
    },
  });
}

// ────────────────────────────────────────────────────────────
// Re-export do tipo para conveniência
// ────────────────────────────────────────────────────────────

export type { Notificacao };
