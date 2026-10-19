import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { todasAsPaginas } from '@/hooks/useSituacaoViaturas';

/** 'dua' sozinho é o valor legado, de antes da separação frente/verso. */
export const TIPOS_DUA = ['dua_frente', 'dua_verso', 'dua'];

/** Ids das viaturas com algum DUA anexado na ficha. */
export function useViaturasComDua() {
  return useQuery({
    queryKey: ['viaturas-com-dua'],
    queryFn: async () => {
      const linhas = await todasAsPaginas<{ viatura_id: string }>((de, ate) =>
        supabase
          .from('viatura_documentos')
          .select('viatura_id')
          .in('tipo_documento', TIPOS_DUA)
          .order('id')
          .range(de, ate)
      );
      return new Set(linhas.map((l) => l.viatura_id));
    },
  });
}
