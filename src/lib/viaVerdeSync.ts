import { supabase } from '@/integrations/supabase/client';

export type ResultadoPedidoViaVerde = 'adicionado' | 'ja_na_fila';

interface PeriodoViaVerde {
  inicio: string | null;
  fim: string | null;
}

/**
 * Pede uma sincronização Via Verde já. A RPC valida o admin e a integração, põe
 * na fila e arranca o drain no servidor — o drain não aceita chamadas do browser.
 */
export async function pedirSyncViaVerde(
  integracaoId: string,
  periodo: PeriodoViaVerde
): Promise<ResultadoPedidoViaVerde> {
  const { data, error } = await supabase.rpc('via_verde_sync_pedir', {
    p_integracao_id: integracaoId,
    p_periodo_inicio: periodo.inicio,
    p_periodo_fim: periodo.fim,
  });
  if (error) throw error;
  return data as ResultadoPedidoViaVerde;
}
