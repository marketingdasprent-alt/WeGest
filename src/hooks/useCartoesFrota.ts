import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Cartões de frota (BP / Repsol / EDP) na perspectiva do motorista.
 *
 * Extraído de MotoristaCartoesFrota, que fazia sete `supabase.from()` directos
 * com `useState` + `useEffect` + um `refetchAll()` chamado à mão.
 *
 * ATOMICIDADE — resolvida em 20260826131640
 * Atribuir e devolver tocam em DUAS tabelas: `cartoes_frota` e a coluna
 * `cartao_<tipo>` da ficha em `motoristas_ativos` (que alimenta o match das
 * transacções importadas). Feitas daqui eram duas chamadas PostgREST sem
 * transacção: se a segunda falhasse, o cartão ficava atribuído e a ficha não,
 * e o consumo desse cartão deixava de ser imputado ao motorista em silêncio.
 *
 * Passaram para RPC `SECURITY DEFINER`, que faz as duas escritas numa só
 * transacção. Por isso `tipo`, `numero` e a data deixaram de ser argumentos:
 * são lidos do próprio cartão, no servidor. Antes o cliente escolhia a coluna
 * da ficha e o valor — um payload trocado escrevia o número de um cartão BP na
 * coluna EDP.
 */

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

// A coluna da ficha (`cartao_<tipo>`) deixou de ser calculada aqui: passou
// para dentro das RPC, num CASE estático sobre as três colunas conhecidas.

/** Cartões actualmente atribuídos a este motorista. */
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

/** Cartões livres daquele tipo — os que se podem atribuir agora. */
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
        .order('numero');
      if (error) throw error;
      return (data ?? []) as CartaoDisponivel[];
    },
    enabled: !!tipo,
  });
}

/** Invalida as duas listas depois de qualquer movimento de cartão. */
function useInvalidarCartoes() {
  const qc = useQueryClient();
  return (motoristaId: string) => {
    qc.invalidateQueries({ queryKey: cartoesAssociadosKey(motoristaId) });
    qc.invalidateQueries({ queryKey: ['cartoes-frota', 'disponiveis'] });
  };
}

export interface MovimentoCartaoArgs {
  cartaoId: string;
  /**
   * NÃO vai no payload da RPC — o servidor lê o motorista do próprio cartão.
   * Serve só para invalidar a lista certa depois de gravar.
   */
  motoristaId: string;
}

/** Marca o cartão em uso E grava o número na ficha, numa só transacção. */
export function useAssociarCartaoAoMotorista() {
  const invalidar = useInvalidarCartoes();
  return useMutation({
    mutationFn: async ({ cartaoId, motoristaId }: MovimentoCartaoArgs): Promise<void> => {
      const { error } = await supabase.rpc('atribuir_cartao_frota', {
        p_cartao_id: cartaoId,
        p_motorista_id: motoristaId,
      });
      if (error) throw error;
    },
    onSuccess: (_r, { motoristaId }) => invalidar(motoristaId),
  });
}

/**
 * Liberta o cartão, guarda quem o tinha, e limpa a ficha — mas só se ela
 * apontava mesmo para este número. Essa comparação passou para o servidor: era
 * feita no componente com os dados que ele por acaso tinha em memória.
 */
export function useDevolverCartaoDoMotorista() {
  const invalidar = useInvalidarCartoes();
  return useMutation({
    mutationFn: async ({ cartaoId }: MovimentoCartaoArgs): Promise<void> => {
      const { error } = await supabase.rpc('devolver_cartao_frota', { p_cartao_id: cartaoId });
      if (error) throw error;
    },
    onSuccess: (_r, { motoristaId }) => invalidar(motoristaId),
  });
}

/** Repõe na ficha o número do cartão que o motorista tem mesmo atribuído. */
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

// ── Administração (CartoesFlotaTab) ──────────────────────────────────────────
// Mesmo domínio, outra perspectiva: aqui gere-se o catálogo de cartões, não a
// atribuição a um motorista.

export const cartoesListaKey = ['cartoes-frota', 'lista'] as const;

/** Catálogo completo, com os nomes das entidades ligadas já embebidos. */
export function useCartoesFrotaLista<T>() {
  return useQuery({
    queryKey: cartoesListaKey,
    queryFn: async (): Promise<T[]> => {
      const { data, error } = await supabase
        .from('cartoes_frota')
        .select(
          '*, motorista:motorista_id(nome), ultimo_motorista:ultimo_motorista_id(nome), cliente:cliente_id(nome)'
        )
        .order('tipo')
        .order('numero');
      if (error) throw error;
      return (data ?? []) as unknown as T[];
    },
  });
}

/** Motoristas para o dropdown de atribuição. */
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

function useInvalidarLista() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['cartoes-frota'] });
}

/** Cria ou actualiza — `cartaoId` ausente significa criar. */
export function useGuardarCartaoFrota() {
  const invalidar = useInvalidarLista();
  return useMutation({
    mutationFn: async ({
      cartaoId,
      payload,
    }: {
      cartaoId?: string;
      payload: Record<string, unknown>;
    }): Promise<void> => {
      const { error } = cartaoId
        ? await supabase
            .from('cartoes_frota')
            .update(payload as never)
            .eq('id', cartaoId)
        : await supabase.from('cartoes_frota').insert(payload as never);
      if (error) throw error;
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

/**
 * Importação em massa. `onConflict: 'org_id,tipo,numero'` — reimportar o mesmo
 * ficheiro actualiza em vez de duplicar.
 */
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
