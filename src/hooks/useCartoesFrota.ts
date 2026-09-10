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
        // Um cartão de cliente também não está livre. O `status` já o excluiria,
        // mas depender só dele deixaria passar qualquer linha que tenha ficado
        // com o estado dessincronizado do titular — e havia 13 assim.
        .is('cliente_id', null)
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
  /**
   * Data do movimento. Omitida, o servidor usa a dele — nunca o relógio do
   * browser. Só é passada quando o utilizador a escreveu à mão no formulário
   * de administração; aceitá-la no ecrã e descartá-la aqui poria a data
   * mostrada em desacordo com o período que decide a imputação.
   */
  data?: string;
}

/** Marca o cartão em uso E grava o número na ficha, numa só transacção. */
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

/**
 * Liberta o cartão, guarda quem o tinha, e limpa a ficha — mas só se ela
 * apontava mesmo para este número. Essa comparação passou para o servidor: era
 * feita no componente com os dados que ele por acaso tinha em memória.
 */
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

/**
 * Atribui o cartão a um CLIENTE.
 *
 * Gémea de `useAssociarCartaoAoMotorista`. A RPC não toca na ficha — as colunas
 * `cartao_<tipo>` só existem em `motoristas_ativos` e são um resto do match
 * legado; o cliente não as tem nem precisa delas, porque a imputação lê
 * `cartao_atribuicoes`.
 */
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

/**
 * Devolve um cartão que está com um cliente.
 *
 * A RPC é a mesma de sempre — recebe só o cartão e ramifica pelo titular no
 * servidor. O que muda aqui são as listas a invalidar.
 */
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
          '*, motorista:motorista_id(nome), ultimo_motorista:ultimo_motorista_id(nome), cliente:cliente_id(nome), ultimo_cliente:ultimo_cliente_id(nome)'
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

/** Clientes para o dropdown de titular, a par dos motoristas. */
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

/**
 * Cria ou actualiza os campos DESCRITIVOS do cartão — `cartaoId` ausente
 * significa criar.
 *
 * O titular, o estado e as datas de entrega/devolução saíram daqui: são um
 * movimento, não um campo, e passaram para as RPC (`atribuir_*`/`devolver_*`),
 * que os escrevem na mesma transacção em que abrem e fecham o período em
 * `cartao_atribuicoes`. Escritos por aqui, o período nunca era tocado e o
 * consumo do cartão deixava de ser imputado — em silêncio.
 *
 * Devolve o id porque criar um cartão já atribuído são duas coisas: a linha
 * tem de existir antes de a RPC lhe poder pegar.
 */
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
