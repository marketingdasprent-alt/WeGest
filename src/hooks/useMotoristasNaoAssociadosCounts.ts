import { useQuery } from '@tanstack/react-query';
import { startOfWeek, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

/** Cartões de combustível com transações não associadas a um motorista. */
export function useCartoesNaoAssociadosCount() {
  return useQuery({
    queryKey: ['cartoes-nao-associados-count'],
    queryFn: async () => {
      const desde = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const { data } = await (supabase as any).rpc('get_cartoes_combustivel_nao_associados', {
        p_desde: desde,
      });
      return (data as any[] | null)?.length ?? 0;
    },
  });
}

/** Cartões BP com transações não associadas a um motorista. */
export function useBpNaoAssociadasCount() {
  return useQuery({
    queryKey: ['bp-nao-associadas-count'],
    queryFn: async () => {
      const { data } = await supabase
        .from('bp_transacoes')
        .select('card_number')
        .is('motorista_id', null);
      const unique = new Set<string>(
        (data || []).map((r: any) => r.card_number || '__sem_cartao__')
      );
      return unique.size;
    },
  });
}

/** Matrículas Via Verde com portagens não associadas a um motorista. */
export function usePortagensNaoAssociadasCount() {
  return useQuery({
    queryKey: ['portagens-nao-associadas-count'],
    queryFn: async () => {
      const { data } = await supabase
        .from('via_verde_transacoes')
        .select('matricula')
        .is('motorista_id', null)
        .not('matricula', 'is', null);
      const unique = new Set<string>(((data as any[]) || []).map((r: any) => r.matricula));
      return unique.size;
    },
  });
}
