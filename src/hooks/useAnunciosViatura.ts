import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AnuncioPorAtribuir, ClienteAnuncio } from '@/types/anuncio';

const CHAVE_ELEGIBILIDADE = ['viatura-elegivel-anuncios'] as const;
const CHAVE_DA_VIATURA = ['anuncio-da-viatura'] as const;
const CHAVE_POR_ATRIBUIR = ['anuncios-por-atribuir'] as const;

/** Se a viatura está marcada como elegível para anúncios. */
export function useViaturaElegivelAnuncios(viaturaId: string | null) {
  return useQuery({
    queryKey: [...CHAVE_ELEGIBILIDADE, viaturaId],
    enabled: !!viaturaId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('viaturas')
        .select('elegivel_anuncios')
        .eq('id', viaturaId as string)
        .single();
      if (error) throw error;
      return !!data.elegivel_anuncios;
    },
  });
}

/** Espelho de useAtualizarElegibilidadeCliente — mesma decisão, gravação instantânea. */
export function useAtualizarElegibilidadeViatura() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ viaturaId, elegivel }: { viaturaId: string; elegivel: boolean }) => {
      const { error } = await supabase
        .from('viaturas')
        .update({ elegivel_anuncios: elegivel })
        .eq('id', viaturaId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [...CHAVE_ELEGIBILIDADE, vars.viaturaId] });
    },
  });
}

/** O anúncio ligado a esta viatura, se algum. */
export function useAnuncioDaViatura(viaturaId: string | null) {
  return useQuery({
    queryKey: [...CHAVE_DA_VIATURA, viaturaId],
    enabled: !!viaturaId,
    queryFn: async (): Promise<(ClienteAnuncio & { cliente_nome: string }) | null> => {
      const { data, error } = await supabase
        .from('cliente_anuncios')
        .select(
          'id, cliente_id, viatura_id, preco, data_inicio, data_fim, created_at, clientes(nome)'
        )
        .eq('viatura_id', viaturaId as string)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as any;
      return {
        id: row.id,
        cliente_id: row.cliente_id,
        viatura_id: row.viatura_id,
        preco: row.preco,
        data_inicio: row.data_inicio,
        data_fim: row.data_fim,
        created_at: row.created_at,
        cliente_nome: row.clientes?.nome ?? '—',
      };
    },
  });
}

/** Anúncios por atribuir, de qualquer cliente elegível — povoa o seletor da viatura. */
export function useAnunciosPorAtribuir() {
  return useQuery({
    queryKey: CHAVE_POR_ATRIBUIR,
    queryFn: async (): Promise<AnuncioPorAtribuir[]> => {
      const { data, error } = await supabase
        .from('cliente_anuncios')
        .select('id, preco, data_inicio, data_fim, clientes!inner(nome, elegivel_anuncios)')
        .is('viatura_id', null)
        .eq('clientes.elegivel_anuncios', true)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        id: row.id,
        cliente_nome: row.clientes?.nome ?? '—',
        preco: row.preco,
        data_inicio: row.data_inicio,
        data_fim: row.data_fim,
      }));
    },
  });
}

/**
 * Liga um anúncio a esta viatura — só se ele ainda estiver por atribuir.
 *
 * O `.is('viatura_id', null)` no UPDATE é a comparar-e-trocar: se outra
 * viatura o tiver atribuído entretanto, esta escrita afecta zero linhas em
 * vez de sobrepor a atribuição alheia, e o erro diz exactamente isso.
 */
export function useAtribuirAnuncio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ anuncioId, viaturaId }: { anuncioId: string; viaturaId: string }) => {
      const { data, error } = await supabase
        .from('cliente_anuncios')
        .update({ viatura_id: viaturaId })
        .eq('id', anuncioId)
        .is('viatura_id', null)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Este anúncio já foi atribuído a outra viatura.');
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: CHAVE_POR_ATRIBUIR });
      qc.invalidateQueries({ queryKey: [...CHAVE_DA_VIATURA, vars.viaturaId] });
      qc.invalidateQueries({ queryKey: ['cliente-anuncios'] });
    },
  });
}
