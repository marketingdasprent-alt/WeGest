import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * A última execução falhada de uma regra.
 *
 * É o que alimenta o nó de erro no canvas: mensagem, quando aconteceu e o
 * `runId` que o "Depurar" abre no ExecucaoDrillDownSheet — o drill-down que já
 * existe, e não uma experiência de debug nova.
 */
export interface UltimaFalhaDaRegra {
  runId: string;
  erro: string;
  quando: string;
}

export function useUltimaFalhaDaRegra(ruleId: string | null) {
  return useQuery({
    queryKey: ['automacao-ultima-falha', ruleId],
    queryFn: async (): Promise<UltimaFalhaDaRegra | null> => {
      const { data, error } = await supabase
        .from('automation_runs')
        .select('id, error_message, created_at')
        .eq('rule_id', ruleId as string)
        .eq('status', 'failed')
        .not('error_message', 'is', null)
        .order('created_at', { ascending: false })
        // Desempate estável: vários runs falham na mesma transacção de scan e
        // partilham `created_at` ao milissegundo.
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data?.error_message) return null;

      return { runId: data.id, erro: data.error_message, quando: data.created_at };
    },
    enabled: !!ruleId,
    staleTime: 30_000,
  });
}
