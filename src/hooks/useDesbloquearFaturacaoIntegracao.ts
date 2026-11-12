import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/utils/errorMessage';

// TODO: tirar o cast quando o types.ts for regenerado com a migração 20261112100000.
type RpcSemTipos = (
  fn: 'desbloquear_faturacao_integracao',
  args: { p_integracao_id: string }
) => Promise<{ error: { message: string } | null }>;

/** Volta a deixar emitir numa integração que a edge travou por um total divergente. */
export function useDesbloquearFaturacaoIntegracao() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (integracaoId: string) => {
      const rpc = supabase.rpc.bind(supabase) as unknown as RpcSemTipos;
      const { error } = await rpc('desbloquear_faturacao_integracao', {
        p_integracao_id: integracaoId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // O refresh da lista de integrações vem do onSuccess do chamador (fetchAll).
      qc.invalidateQueries({ queryKey: ['faturacao-opcoes'] });
      toast({ title: 'Faturação desbloqueada' });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Erro',
        description: errorMessage(error),
        variant: 'destructive',
      });
    },
  });
}
