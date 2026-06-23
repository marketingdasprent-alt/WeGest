import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Motorista } from '@/types/motorista';

interface UseMotoristaOptions {
  /** Se true, retorna apenas motoristas com status_ativo=true (padrão: false) */
  apenasAtivos?: boolean;
  /** Se true, retorna apenas motoristas de slot (is_slot=true), independente
   *  do status — os carros são do motorista, o slot não depende de estar "ativo". */
  apenasSlot?: boolean;
  /** Se false, a query não é executada */
  enabled?: boolean;
}

export function useMotoristas(options: UseMotoristaOptions = {}) {
  const { apenasAtivos = false, apenasSlot = false, enabled = true } = options;

  return useQuery({
    queryKey: ['motoristas', { apenasAtivos, apenasSlot }],
    queryFn: async () => {
      let q = supabase.from('motoristas_ativos').select('*').order('nome');

      // Slot: tolerante ao desync flag/valor — mostra quem tem is_slot=true
      // OU um valor semanal de slot definido (slot_valor_semanal > 0).
      if (apenasSlot) q = q.or('is_slot.eq.true,slot_valor_semanal.gt.0');
      else if (apenasAtivos) q = q.eq('status_ativo', true);

      const { data, error } = await q;
      if (error) throw error;
      return data as Motorista[];
    },
    enabled,
  });
}
