import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ViaturaBasic {
  id: string;
  matricula: string;
  /** Data da primeira matrícula (yyyy-mm-dd) — usada nos documentos. */
  data_matricula: string | null;
  marca: string;
  modelo: string;
  status: string;
  categoria: string | null;
  km_atual: number | null;
  /** Nome do tipo de combustível, resolvido do catálogo (combustivel_id) com o texto legado como fallback. */
  combustivel: string | null;
  combustivel_id: string | null;
  is_vendida: boolean | null;
  is_slot: boolean | null;
  grupo_id: string | null;
  modelo_id: string | null;
  /** Tipo de viatura (frota) — usado para derivar elegibilidade TVDE via viatura_tipos.elegivel_tvde. */
  tipo_id: string | null;
  habilitada_tvde: boolean;
  emissor_id: string | null;
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
          'id, matricula, data_matricula, marca, modelo, status, categoria, km_atual, combustivel, combustivel_id, is_vendida, is_slot, grupo_id, marca_id, modelo_id, tipo_id, habilitada_tvde, emissor_id'
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

      // O tipo de combustível costuma estar no catálogo (combustivel_id) e o
      // campo de texto `combustivel` vir vazio. Resolver o nome a partir do
      // catálogo, com o texto legado como fallback.
      const { data: catalogo } = await supabase.from('viatura_combustiveis').select('id, nome');
      const nomePorId = new Map((catalogo ?? []).map((c) => [c.id, c.nome as string]));

      return (data ?? []).map((v) => ({
        ...v,
        combustivel:
          (v.combustivel_id ? nomePorId.get(v.combustivel_id) : null) ?? v.combustivel ?? null,
      })) as ViaturaBasic[];
    },
    enabled,
  });
}
