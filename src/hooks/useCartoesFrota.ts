import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TipoCartao = 'bp' | 'repsol' | 'edp';

export interface CartaoAssociado {
  id: string;
  numero: string;
  tipo: TipoCartao;
  status: string;
  limite: number | null;
}

export interface CartaoDisponivel {
  id: string;
  numero: string;
  detentor: string | null;
  limite: number | null;
}

export const cartoesAssociadosKey = (motoristaId: string) =>
  ['cartoes-frota', 'associados', motoristaId] as const;
export const cartoesDisponiveisKey = (tipo: TipoCartao | undefined) =>
  ['cartoes-frota', 'disponiveis', tipo] as const;

export function useCartoesAssociados(motoristaId: string) {
  return useQuery({
    queryKey: cartoesAssociadosKey(motoristaId),
    queryFn: async (): Promise<CartaoAssociado[]> => {
      const { data, error } = await supabase
        .from('cartoes_frota')
        .select('id, numero, tipo, status, limite')
        .eq('motorista_id', motoristaId)
        .order('tipo')
        .order('numero');
      if (error) throw error;
      return (data ?? []) as CartaoAssociado[];
    },
    enabled: !!motoristaId,
  });
}

export function useCartoesDisponiveis(tipo: TipoCartao | undefined) {
  return useQuery({
    queryKey: cartoesDisponiveisKey(tipo),
    queryFn: async (): Promise<CartaoDisponivel[]> => {
      const { data, error } = await supabase
        .from('cartoes_frota')
        .select('id, numero, detentor, limite')
        .eq('tipo', tipo as TipoCartao)
        .eq('status', 'disponivel')
        .is('motorista_id', null)

        .is('cliente_id', null)
        .order('numero');
      if (error) throw error;
      return (data ?? []) as CartaoDisponivel[];
    },
    enabled: !!tipo,
  });
}

function useInvalidarCartoes() {
  const qc = useQueryClient();
  return (motoristaId: string) => {
    qc.invalidateQueries({ queryKey: cartoesAssociadosKey(motoristaId) });
    qc.invalidateQueries({ queryKey: ['cartoes-frota', 'disponiveis'] });
  };
}

export interface MovimentoCartaoArgs {
  cartaoId: string;

  motoristaId: string;

  data?: string;
}

export function useAssociarCartaoAoMotorista() {
  const invalidar = useInvalidarCartoes();
  return useMutation({
    mutationFn: async ({ cartaoId, motoristaId, data }: MovimentoCartaoArgs): Promise<void> => {
      const { error } = await supabase.rpc('atribuir_cartao_frota', {
        p_cartao_id: cartaoId,
        p_motorista_id: motoristaId,
        ...(data ? { p_de: data } : {}),
      });
      if (error) throw error;
    },
    onSuccess: (_r, { motoristaId }) => invalidar(motoristaId),
  });
}

export function useDevolverCartaoDoMotorista() {
  const invalidar = useInvalidarCartoes();
  return useMutation({
    mutationFn: async ({ cartaoId, data }: MovimentoCartaoArgs): Promise<void> => {
      const { error } = await supabase.rpc('devolver_cartao_frota', {
        p_cartao_id: cartaoId,
        ...(data ? { p_ate: data } : {}),
      });
      if (error) throw error;
    },
    onSuccess: (_r, { motoristaId }) => invalidar(motoristaId),
  });
}

export function useAssociarCartaoAoCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      cartaoId,
      clienteId,
      data,
    }: {
      cartaoId: string;
      clienteId: string;
      data?: string;
    }): Promise<void> => {
      const { error } = await supabase.rpc('atribuir_cartao_frota_cliente', {
        p_cartao_id: cartaoId,
        p_cliente_id: clienteId,
        ...(data ? { p_de: data } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cartoes-frota'] });
      qc.invalidateQueries({ queryKey: ['cliente-combustivel'] });
    },
  });
}

export function useDevolverCartaoDoCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cartaoId, data }: { cartaoId: string; data?: string }): Promise<void> => {
      const { error } = await supabase.rpc('devolver_cartao_frota', {
        p_cartao_id: cartaoId,
        ...(data ? { p_ate: data } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cartoes-frota'] });
      qc.invalidateQueries({ queryKey: ['cliente-combustivel'] });
    },
  });
}

export function useSincronizarFichaCartao() {
  const invalidar = useInvalidarCartoes();
  return useMutation({
    mutationFn: async ({ cartaoId }: MovimentoCartaoArgs): Promise<void> => {
      const { error } = await supabase.rpc('sincronizar_ficha_cartao_frota', {
        p_cartao_id: cartaoId,
      });
      if (error) throw error;
    },
    onSuccess: (_r, { motoristaId }) => invalidar(motoristaId),
  });
}

export const cartoesListaKey = ['cartoes-frota', 'lista'] as const;

export function useCartoesFrotaLista<T>() {
  return useQuery({
    queryKey: cartoesListaKey,
    queryFn: async (): Promise<T[]> => {
      const { data, error } = await supabase
        .from('cartoes_frota')
        .select(
          '*, motorista:motorista_id(nome), ultimo_motorista:ultimo_motorista_id(nome), cliente:cliente_id(nome), ultimo_cliente:ultimo_cliente_id(nome)'
        )
        .order('tipo')
        .order('numero');
      if (error) throw error;
      return (data ?? []) as unknown as T[];
    },
  });
}

export function useMotoristasParaCartoes() {
  return useQuery({
    queryKey: ['cartoes-frota', 'motoristas-opcoes'],
    queryFn: async (): Promise<Array<{ id: string; nome: string }>> => {
      const { data, error } = await supabase
        .from('motoristas_ativos')
        .select('id, nome')
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useClientesParaCartoes() {
  return useQuery({
    queryKey: ['cartoes-frota', 'clientes-opcoes'],
    queryFn: async (): Promise<Array<{ id: string; nome: string }>> => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome')
        .is('deleted_at', null)
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useInvalidarLista() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['cartoes-frota'] });
}

export function useGuardarCartaoFrota() {
  const invalidar = useInvalidarLista();
  return useMutation({
    mutationFn: async ({
      cartaoId,
      payload,
    }: {
      cartaoId?: string;
      payload: Record<string, unknown>;
    }): Promise<string> => {
      const { data, error } = cartaoId
        ? await supabase
            .from('cartoes_frota')
            .update(payload as never)
            .eq('id', cartaoId)
            .select('id')
            .single()
        : await supabase
            .from('cartoes_frota')
            .insert(payload as never)
            .select('id')
            .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: invalidar,
  });
}

export function useEliminarCartaoFrota() {
  const invalidar = useInvalidarLista();
  return useMutation({
    mutationFn: async (cartaoId: string): Promise<void> => {
      const { error } = await supabase.from('cartoes_frota').delete().eq('id', cartaoId);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function useImportarCartoesFrota() {
  const invalidar = useInvalidarLista();
  return useMutation({
    mutationFn: async (linhas: Array<Record<string, unknown>>): Promise<number> => {
      const { error } = await supabase
        .from('cartoes_frota')
        .upsert(linhas as never, { onConflict: 'org_id,tipo,numero', ignoreDuplicates: false });
      if (error) throw error;
      return linhas.length;
    },
    onSuccess: invalidar,
  });
}
