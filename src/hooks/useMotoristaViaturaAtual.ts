import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * A viatura que o motorista tem atribuída neste momento.
 *
 * É a única fonte de "qual é a viatura dele" no portal: o Início, a secção
 * Viatura e o registo de quilómetros lêem daqui. Antes havia duas queries
 * com critérios diferentes (uma com `km_atual`, outra sem) e acabavam a
 * discordar sobre qual era a viatura.
 */

export interface ViaturaAtualMotorista {
  viaturaId: string;
  matricula: string;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  cor: string | null;
  categoria: string | null;
  combustivel: string | null;
  kmAtual: number | null;
  /** Desde quando está com este motorista (`motorista_viaturas.data_inicio`). */
  atribuidaEm: string | null;
}

export function useMotoristaViaturaAtual(motoristaId: string | null | undefined) {
  return useQuery({
    queryKey: ['motorista-viatura', motoristaId],
    enabled: !!motoristaId,
    queryFn: async (): Promise<ViaturaAtualMotorista | null> => {
      // `limit(1)` e não `maybeSingle()`: há motoristas com mais do que uma
      // atribuição activa em aberto (dados por limpar). O `maybeSingle` devolve
      // erro nesses casos e o cartão desaparecia sem dizer porquê — mais vale
      // mostrar a mais recente do que nenhuma.
      const { data, error } = await supabase
        .from('motorista_viaturas')
        .select(
          'data_inicio, viatura:viaturas (id, matricula, marca, modelo, ano, cor, categoria, combustivel, km_atual)'
        )
        .eq('motorista_id', motoristaId!)
        .eq('status', 'ativo')
        .is('data_fim', null)
        .order('data_inicio', { ascending: false })
        .limit(1);

      if (error) throw error;

      const linha = data?.[0];
      const v = linha?.viatura as
        | {
            id: string;
            matricula: string | null;
            marca: string | null;
            modelo: string | null;
            ano: number | null;
            cor: string | null;
            categoria: string | null;
            combustivel: string | null;
            km_atual: number | null;
          }
        | undefined;
      if (!v?.id) return null;

      return {
        viaturaId: v.id,
        matricula: v.matricula ?? '—',
        marca: v.marca ?? null,
        modelo: v.modelo ?? null,
        ano: v.ano ?? null,
        cor: v.cor ?? null,
        categoria: v.categoria ?? null,
        combustivel: v.combustivel ?? null,
        kmAtual: v.km_atual ?? null,
        atribuidaEm: (linha?.data_inicio as string | null | undefined) ?? null,
      };
    },
  });
}
