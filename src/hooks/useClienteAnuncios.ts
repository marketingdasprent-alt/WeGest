import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ClienteAnuncio } from '@/types/anuncio';

const CHAVE_ELEGIBILIDADE = ['cliente-elegivel-anuncios'] as const;
const CHAVE_LISTA = ['cliente-anuncios'] as const;

/** Se a empresa está marcada como elegível para anúncios. */
export function useClienteElegivelAnuncios(clienteId: string | null) {
  return useQuery({
    queryKey: [...CHAVE_ELEGIBILIDADE, clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('clientes')
        .select('elegivel_anuncios')
        .eq('id', clienteId as string)
        .single();
      if (error) throw error;
      return !!data.elegivel_anuncios;
    },
  });
}

/**
 * Grava a elegibilidade na hora — não espera pelo "Guardar" do formulário
 * grande do cliente. Mesma decisão do lado da viatura
 * (useAtualizarElegibilidadeViatura), para os dois toggles se comportarem
 * da mesma maneira.
 */
export function useAtualizarElegibilidadeCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clienteId, elegivel }: { clienteId: string; elegivel: boolean }) => {
      const { error } = await supabase
        .from('clientes')
        .update({ elegivel_anuncios: elegivel })
        .eq('id', clienteId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [...CHAVE_ELEGIBILIDADE, vars.clienteId] });
    },
  });
}

/** Anúncios do cliente, mais recente primeiro. */
export function useClienteAnuncios(clienteId: string | null) {
  return useQuery({
    queryKey: [...CHAVE_LISTA, clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<ClienteAnuncio[]> => {
      const { data, error } = await supabase
        .from('cliente_anuncios')
        .select(
          'id, cliente_id, viatura_id, preco, data_inicio, data_fim, created_at, viaturas(matricula)'
        )
        .eq('cliente_id', clienteId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        id: row.id,
        cliente_id: row.cliente_id,
        viatura_id: row.viatura_id,
        preco: row.preco,
        data_inicio: row.data_inicio,
        data_fim: row.data_fim,
        created_at: row.created_at,
        viatura_matricula: row.viaturas?.matricula ?? null,
      }));
    },
  });
}

/** Nasce sempre sem viatura — quem atribui é o lado da viatura. */
export function useCriarAnuncio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clienteId,
      preco,
      dataInicio,
      dataFim,
    }: {
      clienteId: string;
      preco: number;
      dataInicio: string;
      dataFim: string;
    }) => {
      const { error } = await supabase.from('cliente_anuncios').insert({
        cliente_id: clienteId,
        preco,
        data_inicio: dataInicio,
        data_fim: dataFim,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [...CHAVE_LISTA, vars.clienteId] });
      qc.invalidateQueries({ queryKey: ['anuncios-por-atribuir'] });
    },
  });
}

export function useAtualizarAnuncio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      anuncioId,
      preco,
      dataInicio,
      dataFim,
    }: {
      anuncioId: string;
      preco: number;
      dataInicio: string;
      dataFim: string;
    }) => {
      const { error } = await supabase
        .from('cliente_anuncios')
        .update({ preco, data_inicio: dataInicio, data_fim: dataFim })
        .eq('id', anuncioId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHAVE_LISTA });
      qc.invalidateQueries({ queryKey: ['anuncios-por-atribuir'] });
    },
  });
}

/**
 * Só apaga quando não há viatura atribuída. O `.is('viatura_id', null)` no
 * DELETE é a garantia real — o botão desactivado na UI é só a primeira
 * linha de defesa, não a única.
 */
export function useApagarAnuncio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ anuncioId }: { anuncioId: string }) => {
      const { data, error } = await supabase
        .from('cliente_anuncios')
        .delete()
        .eq('id', anuncioId)
        .is('viatura_id', null)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Desatribui a viatura antes de apagar este anúncio.');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHAVE_LISTA });
    },
  });
}

/**
 * Liberta a viatura sem apagar o anúncio. Partilhada pelos dois perfis: o do
 * cliente chama-a para libertar um anúncio seu, o da viatura
 * (AnunciosViaturaCard, Task 4) chama-a para se desligar do que tem.
 */
export function useDesatribuirAnuncio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ anuncioId }: { anuncioId: string }) => {
      const { error } = await supabase
        .from('cliente_anuncios')
        .update({ viatura_id: null })
        .eq('id', anuncioId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHAVE_LISTA });
      qc.invalidateQueries({ queryKey: ['anuncios-por-atribuir'] });
      qc.invalidateQueries({ queryKey: ['anuncio-da-viatura'] });
    },
  });
}
