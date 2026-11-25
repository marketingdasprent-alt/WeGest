import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { lerDetalheResumo } from '@/lib/resumoSemanalDetalhe';
import type { AcertoSemanalDetalhado } from '@/hooks/useAcertoSemanal';

// `detalhe` vem da migração 20261117170000; os tipos gerados ainda não o têm.
const db = supabase as unknown as { from: (t: string) => any };

interface LinhaAcerto {
  id: string;
  semana_inicio: string;
  semana_fim: string;
  liquido: number | string;
  detalhe: unknown;
}

/**
 * A semana do motorista tal como a lista de Contas/Resumo a gravou ao fechar.
 * A política da base só devolve as linhas do próprio motorista já enviadas:
 * null = o escritório ainda não enviou esta semana.
 */
export function useResumoSemanaFechada(
  motoristaId: string | null | undefined,
  semanaInicio: string
) {
  return useQuery({
    queryKey: ['motorista-resumo-semana-fechada', motoristaId, semanaInicio],
    enabled: !!motoristaId,
    queryFn: async (): Promise<AcertoSemanalDetalhado | null> => {
      const { data, error } = await db
        .from('motorista_liquido_semanal')
        .select('id, semana_inicio, semana_fim, liquido, detalhe')
        .eq('motorista_id', motoristaId)
        .eq('semana_inicio', semanaInicio)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const l = data as LinhaAcerto;
      return {
        id: l.id,
        semanaInicio: l.semana_inicio,
        semanaFim: l.semana_fim,
        liquido: Number(l.liquido) || 0,
        detalhe: lerDetalheResumo(l.detalhe ?? null),
      };
    },
  });
}
