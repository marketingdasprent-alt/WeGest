import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * O payload do último disparo desta regra.
 *
 * É o que alimenta a coluna de entrada do modal: campos reais, com valores
 * reais, em vez de um schema inventado. Sai de `automation_runs.payload`, que
 * é exactamente o objecto que o motor passa ao render do template — logo, o
 * que a pré-visualização substitui é o que o email vai levar.
 */
export function useUltimoPayloadDaRegra(ruleId: string | null) {
  return useQuery({
    queryKey: ['automacao-ultimo-payload', ruleId],
    queryFn: async (): Promise<Record<string, unknown> | null> => {
      const { data, error } = await supabase
        .from('automation_runs')
        .select('payload, created_at')
        .eq('rule_id', ruleId as string)
        .order('created_at', { ascending: false })
        // Desempate estável: vários runs partilham `created_at` ao milissegundo
        // quando o mesmo scan os cria de uma vez.
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      const payload = data?.payload;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
      return payload as Record<string, unknown>;
    },
    enabled: !!ruleId,
    staleTime: 60_000,
  });
}
