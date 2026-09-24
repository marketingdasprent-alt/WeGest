import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RenovacaoRegisto {
  id: string;
  contratoId: string;
  criadoEm: string;
  proxima: string;
}

interface LinhaHistorico {
  id: string;
  contrato_id: string;
  detalhe: string | null;
  criado_em: string;
}

const RE_PROXIMA = /Próxima renovação: (\d{2}\/\d{2}\/\d{4})/;

/**
 * Lê uma renovação sem versão (08-09 a 24-09) do texto em contrato_historico.
 * As reaberturas de legado ("Reaberto em", "depois de ter terminado") criaram
 * versão e já aparecem no histórico de versões — ficam de fora.
 */
export function lerRenovacao(linha: LinhaHistorico): RenovacaoRegisto | null {
  const d = linha.detalhe ?? '';
  if (!d.startsWith('Renovado em ')) return null;
  const proxima = RE_PROXIMA.exec(d)?.[1];
  if (!proxima) return null;
  return { id: linha.id, contratoId: linha.contrato_id, criadoEm: linha.criado_em, proxima };
}

/**
 * Renovações TVDE feitas quando renovar não criava versão (20260908093000 até
 * 20260924180000): só existem como texto em contrato_historico.
 */
export function useContratoRenovacoes(contratoIds: string[]) {
  return useQuery({
    queryKey: ['contrato-renovacoes', contratoIds],
    queryFn: async (): Promise<RenovacaoRegisto[]> => {
      const { data, error } = await supabase
        .from('contrato_historico')
        .select('id, contrato_id, detalhe, criado_em')
        .in('contrato_id', contratoIds)
        .like('detalhe', 'Renovado em %')
        .order('criado_em', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as LinhaHistorico[])
        .map(lerRenovacao)
        .filter((r): r is RenovacaoRegisto => r !== null);
    },
    enabled: contratoIds.length > 0,
  });
}
