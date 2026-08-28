import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Marcar uma notificação como resolvida.
 *
 * Este ficheiro exportava também `useNotifications`, um segundo caminho de
 * leitura paginada de `notificacoes`. Foi removido a 31/07/2026 por não ter um
 * único consumidor: a leitura viva é o `useNotificacoesHistorico` (infinite
 * query), usado pelo NotificationBell e pela NotificacoesPage. Dois caminhos de
 * leitura sobre a mesma tabela, com só um a ser exercitado, é como uma
 * correcção entra num e não no outro.
 */

/**
 * NÃO ESTREITAR esta chave.
 *
 * O hook vivo regista-se em `['notificacoes', 'infinite', { … }]`. O
 * `invalidateQueries` abaixo só o alcança porque o React Query faz
 * correspondência por prefixo — passar isto para algo como
 * `['notificacoes', 'mutation']` deixaria de invalidar a lista, e o sino
 * continuaria a mostrar a notificação já resolvida sem nenhum erro visível.
 */
const QUERY_KEY_BASE = ['notificacoes'] as const;

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
