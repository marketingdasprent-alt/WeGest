import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Dispositivo OBE (Via Verde) de uma viatura.
 *
 * Extraído de ViaturaObeDispositivoSection, que fazia quatro `supabase.from()`
 * directos com `useState` + `useEffect` e um `carregar()` chamado à mão depois
 * de cada mutação — o padrão que o §5/§12 do AGENTS.md substitui por React
 * Query com invalidação.
 */

export interface DispositivoObe {
  id: string;
  nr_equipamento: string;
  contrato: string | null;
  ativo: boolean;
  notas: string | null;
}

export interface DispositivosObeDaViatura {
  /** O que está ligado a esta viatura, ou null se nenhum. */
  atual: DispositivoObe | null;
  /** Os que não estão ligados a viatura nenhuma. */
  disponiveis: DispositivoObe[];
}

const COLUNAS = 'id, nr_equipamento, contrato, ativo, notas';

/** Chave partilhada: as mutations invalidam por aqui. */
export const viaturaObeQueryKey = (viaturaId: string) => ['viatura-obe', viaturaId] as const;

export function useViaturaObeDispositivos(viaturaId: string) {
  return useQuery({
    queryKey: viaturaObeQueryKey(viaturaId),
    queryFn: async (): Promise<DispositivosObeDaViatura> => {
      const [{ data: assoc, error: e1 }, { data: livres, error: e2 }] = await Promise.all([
        supabase.from('dispositivos_obe').select(COLUNAS).eq('viatura_id', viaturaId).maybeSingle(),
        supabase
          .from('dispositivos_obe')
          .select(COLUNAS)
          .is('viatura_id', null)
          .order('nr_equipamento'),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return {
        atual: (assoc as DispositivoObe | null) ?? null,
        disponiveis: (livres as DispositivoObe[] | null) ?? [],
      };
    },
    enabled: !!viaturaId,
  });
}

interface LigacaoObeArgs {
  dispositivoId: string;
  /** Só para invalidar a query certa depois de gravar. */
  viaturaId: string;
}

function useLigacaoObe(novoViaturaId: (viaturaId: string) => string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ dispositivoId, viaturaId }: LigacaoObeArgs): Promise<void> => {
      const { error } = await supabase
        .from('dispositivos_obe')
        .update({ viatura_id: novoViaturaId(viaturaId) })
        .eq('id', dispositivoId);
      if (error) throw error;
    },
    onSuccess: (_r, { viaturaId }) => {
      qc.invalidateQueries({ queryKey: viaturaObeQueryKey(viaturaId) });
    },
  });
}

/** Liga um dispositivo livre a esta viatura. */
export function useAssociarDispositivoObe() {
  return useLigacaoObe((viaturaId) => viaturaId);
}

/** Desliga o dispositivo da viatura — volta ao lote dos disponíveis. */
export function useRemoverDispositivoObe() {
  return useLigacaoObe(() => null);
}
