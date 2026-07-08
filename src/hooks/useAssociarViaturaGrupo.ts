import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AssociarVars {
  viaturaId: string;
  /** id do grupo (associar/mover) ou null (remover). */
  novoGrupoId: string | null;
}

/**
 * Associa, move ou remove uma viatura de um grupo escrevendo viaturas.grupo_id.
 * Invalida a lista de associadas e a de candidatas do grupo atual. RLS garante
 * que só viaturas da org do utilizador são afetadas.
 */
export function useAssociarViaturaGrupo(grupoId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ viaturaId, novoGrupoId }: AssociarVars) => {
      const { error } = await supabase
        .from('viaturas')
        .update({ grupo_id: novoGrupoId })
        .eq('id', viaturaId);
      if (error) throw error;
    },
    onSuccess: (_data, { novoGrupoId }) => {
      queryClient.invalidateQueries({ queryKey: ['viaturas_grupo', grupoId] });
      queryClient.invalidateQueries({ queryKey: ['viaturas_candidatas', grupoId] });
      toast({ title: novoGrupoId ? 'Viatura associada ao grupo' : 'Viatura removida do grupo' });
    },
    onError: (err: any) => {
      toast({
        title: 'Erro ao atualizar viatura',
        description: err?.message,
        variant: 'destructive',
      });
    },
  });
}
