import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  ehColunaDetalheEmFalta,
  lerDetalheResumo,
  type DetalheResumoSemanal,
} from '@/lib/resumoSemanalDetalhe';

export interface AcertoSemanalDetalhado {
  id: string;
  semanaInicio: string;
  semanaFim: string;
  liquido: number;
  /** null = a semana ainda não tem o resumo completo guardado. */
  detalhe: DetalheResumoSemanal | null;
}

interface LinhaAcerto {
  id: string;
  semana_inicio: string;
  semana_fim: string;
  liquido: number | string;
  detalhe: unknown;
}

// `detalhe` vem da migração 20261117170000; os tipos gerados ainda não o têm.
const db = supabase as unknown as { from: (t: string) => any };

/**
 * Uma semana fechada do motorista, com o resumo completo. A política da base só
 * devolve linhas do próprio motorista e já enviadas; outra linha vem vazia.
 */
export function useAcertoSemanal(id: string | null | undefined) {
  return useQuery({
    queryKey: ['motorista-acerto-semanal', id],
    enabled: !!id,
    queryFn: async (): Promise<AcertoSemanalDetalhado | null> => {
      const buscar = (colunas: string) =>
        db.from('motorista_liquido_semanal').select(colunas).eq('id', id).maybeSingle();

      let { data, error } = await buscar('id, semana_inicio, semana_fim, liquido, detalhe');
      // Base ainda sem a coluna (migração por aplicar): mostra o valor da semana
      // e o aviso de detalhe indisponível, em vez de um erro.
      if (error && ehColunaDetalheEmFalta(error)) {
        ({ data, error } = await buscar('id, semana_inicio, semana_fim, liquido'));
      }
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
