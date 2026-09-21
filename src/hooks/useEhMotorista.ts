import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';

interface Options {
  /** Só vale a pena perguntar quando a resposta muda alguma coisa (ex.: app instalada). */
  enabled?: boolean;
}

/**
 * Este utilizador tem ficha de motorista em alguma organização?
 *
 * Não se lê `motoristas_ativos` directamente: a RLS RESTRICTIVE por org
 * esconde a ficha a quem tem a org activa noutro lado (staff que também é
 * motorista). A RPC `get_minha_org_motorista` é SECURITY DEFINER e devolve a
 * org onde ele é motorista, ignorando isso — é a mesma que o PainelMotorista
 * usa para alinhar a org antes de carregar a ficha.
 *
 * `undefined` enquanto não se sabe (a carregar, desligado ou erro).
 */
export function useEhMotorista(
  userId: string | null | undefined,
  { enabled = true }: Options = {}
) {
  return useQuery({
    queryKey: ['eh-motorista', userId],
    enabled: enabled && !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('get_minha_org_motorista');
      if (error) throw error;
      return !!data;
    },
  });
}
