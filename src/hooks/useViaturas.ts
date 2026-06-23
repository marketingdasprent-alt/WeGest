import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ViaturaBasic {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  status: string;
  categoria: string | null;
  km_atual: number | null;
  combustivel: string | null;
  is_vendida: boolean | null;
  is_slot: boolean | null;
  grupo_id: string | null;
  habilitada_tvde: boolean;
}

interface UseViaturasOptions {
  /** Se true, exclui viaturas com status 'vendida' (padrão: false) */
  excluirVendidas?: boolean;
  /**
   * Se true, devolve apenas viaturas no mesmo critério que a página "Viaturas
   * Disponíveis": status='disponivel' E sem flag `is_vendida`. Tem prioridade
   * sobre `excluirVendidas` e `status`.
   */
  apenasDisponiveis?: boolean;
  /** Filtrar por status específico */
  status?: string;
  /** Se false, a query não é executada */
  enabled?: boolean;
}

export function useViaturas(options: UseViaturasOptions = {}) {
  const { excluirVendidas = false, apenasDisponiveis = false, status, enabled = true } = options;

  return useQuery({
    queryKey: ['viaturas', { excluirVendidas, apenasDisponiveis, status }],
    queryFn: async () => {
      let q = supabase
        .from('viaturas')
        .select(
          'id, matricula, marca, modelo, status, categoria, km_atual, combustivel, is_vendida, is_slot, grupo_id, habilitada_tvde'
        )
        .order('matricula');

      if (apenasDisponiveis) {
        q = q.eq('status', 'disponivel').not('is_vendida', 'is', true);
      } else {
        if (excluirVendidas) q = q.not('status', 'eq', 'vendida').not('is_vendida', 'is', true);
        if (status) q = q.eq('status', status);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data as ViaturaBasic[];
    },
    enabled,
  });
}
