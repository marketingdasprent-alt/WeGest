import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import {
  situacaoViaturas,
  type AssociacaoMotorista,
  type ContratoViatura,
} from '@/utils/ocupantesViaturas';

const PAGINA = 1000;

/** O PostgREST corta em 1000 linhas; o histórico de associações passa disso. */
async function todasAsPaginas<T>(
  pedir: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await pedir(de, de + PAGINA - 1);
    if (error) throw error;
    const pagina = (data ?? []) as T[];
    linhas.push(...pagina);
    if (pagina.length < PAGINA) return linhas;
  }
}

/** Por viatura: com quem está agora e desde quando está livre. */
export function useSituacaoViaturas(enabled = true) {
  return useQuery({
    queryKey: ['viaturas-situacao'],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const [associacoes, contratos] = await Promise.all([
        todasAsPaginas<AssociacaoMotorista>((de, ate) =>
          supabase
            .from('motorista_viaturas')
            .select('viatura_id, status, data_fim, motorista:motoristas_ativos(id, nome)')
            .order('id')
            .range(de, ate)
        ),
        todasAsPaginas<ContratoViatura>((de, ate) =>
          supabase
            .from('contratos_renting')
            .select(
              'id, viatura_id, estado_operacional, data_fim, cliente:clientes!contratos_renting_cliente_id_fkey(id, nome, nome_comercial)'
            )
            .is('deleted_at', null)
            .is('substituido_em', null)
            .not('viatura_id', 'is', null)
            .in('estado_operacional', ['agendado', 'em_curso', 'devolvido', 'fechado'])
            .order('id')
            .range(de, ate)
        ),
      ]);
      return situacaoViaturas(associacoes, contratos);
    },
  });
}
