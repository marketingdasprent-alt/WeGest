import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const KEY = ['quadro-token'];

export function useQuadroToken() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quadro_tokens')
        .select('token')
        .eq('ativo', true)
        .maybeSingle();
      if (error) throw error;
      return data?.token ?? null;
    },
  });
}

export function useRegenerarQuadroToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Desativar tokens ativos (RLS limita à org atual). O índice único parcial
      // (org_id) WHERE ativo obriga a desativar antes de inserir o novo.
      await supabase.from('quadro_tokens').update({ ativo: false }).eq('ativo', true);
      try {
        const { data, error } = await supabase
          .from('quadro_tokens')
          .insert({}) // org_id/token via defaults da BD
          .select('token')
          .single();
        if (error) throw error;
        return data.token as string;
      } catch {
        throw new Error('Não foi possível gerar o link. Tente novamente.');
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
