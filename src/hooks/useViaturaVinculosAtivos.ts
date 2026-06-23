// Vínculos ativos de UMA viatura: a reserva / contrato (renting) / movimentação
// atualmente abertos que a prendem. Devolve o id de cada um (ou null) para o
// perfil da viatura poder ligar diretamente ao registo ("Visualizar X").
//
// "Ativo" segue os mesmos critérios de useViaturasOcupacao: estado por terminar,
// mesmo que o período comece no futuro.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ViaturaVinculosAtivos {
  reserva: { id: string } | null;
  contrato: { id: string } | null;
  movimento: { id: string } | null;
}

export function useViaturaVinculosAtivos(viaturaId?: string | null) {
  return useQuery({
    queryKey: ['viatura-vinculos-ativos', viaturaId],
    enabled: !!viaturaId,
    staleTime: 30_000,
    queryFn: async (): Promise<ViaturaVinculosAtivos> => {
      const [reservas, contratos, movimentos] = await Promise.all([
        supabase
          .from('reservas')
          .select('id')
          .eq('viatura_id', viaturaId!)
          .is('deleted_at', null)
          .in('estado', ['pendente', 'confirmada', 'em_curso'])
          .limit(1),
        supabase
          .from('contratos_renting')
          .select('id')
          .eq('viatura_id', viaturaId!)
          .is('deleted_at', null)
          .in('estado_operacional', ['agendado', 'em_curso'])
          .limit(1),
        supabase
          .from('movimentos')
          .select('id')
          .eq('viatura_id', viaturaId!)
          .in('estado', ['planeado', 'a_decorrer'])
          .limit(1),
      ]);

      return {
        reserva: reservas.data?.[0] ?? null,
        contrato: contratos.data?.[0] ?? null,
        movimento: movimentos.data?.[0] ?? null,
      };
    },
  });
}
