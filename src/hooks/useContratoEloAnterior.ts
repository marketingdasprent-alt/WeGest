import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';

export interface EloAnterior {
  matricula: string | null;
  /** Instante da troca — é o melhor registo que existe do momento em que a
   *  viatura mudou. */
  substituido_em: string | null;
  data_inicio: string | null;
}

/**
 * A versão que este contrato veio substituir, quando veio de uma troca.
 *
 * Devolve `null` para contratos novos e para os que não nasceram de uma troca.
 * São duas idas à base de dados em vez de um join embebido de propósito: a
 * relação é auto-referencial (`contrato_anterior_id` aponta para a própria
 * tabela) e a forma explícita é mais fácil de ler do que a sintaxe de
 * embedding do PostgREST para o mesmo caso.
 */
export function useContratoEloAnterior(contratoId?: string | null) {
  return useQuery<EloAnterior | null>({
    queryKey: ['contrato-elo-anterior', contratoId],
    enabled: !!contratoId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: actual, error: errActual } = await supabase
        .from('contratos_renting')
        .select('contrato_anterior_id')
        .eq('id', contratoId!)
        .maybeSingle();
      if (errActual) throw errActual;
      if (!actual?.contrato_anterior_id) return null;

      const { data: anterior, error: errAnterior } = await supabase
        .from('contratos_renting')
        .select('matricula, substituido_em, data_inicio')
        .eq('id', actual.contrato_anterior_id)
        .maybeSingle();
      if (errAnterior) throw errAnterior;
      return anterior ?? null;
    },
  });
}
