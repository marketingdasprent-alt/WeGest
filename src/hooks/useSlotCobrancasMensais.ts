/**
 * Cobranças mensais de slot de um motorista (Administração → Resumo).
 * Resolve em 2 passos (RLS-safe): reservas slot do motorista → cobranças
 * tipo_cobranca='slot_mensal' por reserva_id.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SlotCobranca {
  id: string;
  periodo_de: string;
  periodo_ate: string;
  descricao: string | null;
  valor_total: number | null;
  valor_sem_iva: number | null;
  taxa_iva: number | null;
  estado: string;
  emite_fatura_fiscal: boolean;
  documento_externo_ref: string | null;
  destinatario_id: string;
  destinatario_nome: string;
  reserva_id: string | null;
}

export function useSlotCobrancasMensais(motoristaId?: string) {
  return useQuery({
    queryKey: ['slot-cobrancas-mensais', motoristaId],
    enabled: !!motoristaId,
    queryFn: async (): Promise<SlotCobranca[]> => {
      const { data: reservas, error: errR } = await supabase
        .from('reservas')
        .select('id')
        .eq('condutor_id', motoristaId!)
        .eq('regime', 'slot');
      if (errR) throw errR;
      const reservaIds = (reservas ?? []).map((r: { id: string }) => r.id);
      if (reservaIds.length === 0) return [];

      const { data, error } = await supabase
        .from('contrato_cobrancas')
        .select(
          'id, periodo_de, periodo_ate, descricao, valor_total, valor_sem_iva, taxa_iva, estado, emite_fatura_fiscal, documento_externo_ref, destinatario_id, destinatario_nome, reserva_id'
        )
        .eq('tipo_cobranca', 'slot_mensal')
        .in('reserva_id', reservaIds)
        .order('periodo_de', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SlotCobranca[];
    },
  });
}
