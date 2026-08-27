import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Cartões de frota (BP / Repsol / EDP) na perspectiva do motorista.
 *
 * Extraído de MotoristaCartoesFrota, que fazia sete `supabase.from()` directos
 * com `useState` + `useEffect` + um `refetchAll()` chamado à mão.
 *
 * NOTA SOBRE ATOMICIDADE (comportamento preservado, não corrigido aqui)
 * Associar e devolver escrevem em TRÊS tabelas — `cartoes_frota` e a coluna
 * `cartao_<tipo>` da ficha em `motoristas_ativos` (que serve o match das
 * transações importadas). São duas chamadas PostgREST, sem transação: se a
 * segunda falhar, o cartão fica atribuído e a ficha não. Fechar isto a sério
 * exige uma RPC `SECURITY DEFINER` que faça as duas escritas numa transacção —
 * está fora do âmbito desta extracção, que não muda comportamento. O que se
 * garante já é que a primeira falha aborta antes da segunda escrita.
 */

/**
 * Tabela fora dos tipos gerados. Estreitar aqui evita espalhar `any` pelas
 * chamadas e mantém o resto do ficheiro tipado.
 */
type SupabaseSemTipos = {
  from: (t: string) => {
    insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    update: (v: Record<string, unknown>) => {
      eq: (
        c: string,
        v: string
      ) => {
        eq: (
          c: string,
          v: string
        ) => { is: (c: string, v: null) => Promise<{ error: { message: string } | null }> };
      };
    };
  };
};

export type TipoCartao = 'bp' | 'repsol' | 'edp';

export interface CartaoAssociado {
  id: string;
  numero: string;
  tipo: TipoCartao;
  status: string;
  limite: number | null;
  /** Necessário para escrever o histórico de atribuição na org certa. */
  org_id: string | null;
}

export interface CartaoDisponivel {
  id: string;
  numero: string;
  detentor: string | null;
  limite: number | null;
  /** Necessário para escrever o histórico de atribuição na org certa. */
  org_id: string | null;
}

export const cartoesAssociadosKey = (motoristaId: string) =>
  ['cartoes-frota', 'associados', motoristaId] as const;
export const cartoesDisponiveisKey = (tipo: TipoCartao | undefined) =>
  ['cartoes-frota', 'disponiveis', tipo] as const;

/** A coluna da ficha do motorista que guarda o número deste tipo de cartão. */
const colunaFicha = (tipo: TipoCartao) => `cartao_${tipo}`;

/** Cartões actualmente atribuídos a este motorista. */
export function useCartoesAssociados(motoristaId: string) {
  return useQuery({
    queryKey: cartoesAssociadosKey(motoristaId),
    queryFn: async (): Promise<CartaoAssociado[]> => {
      const { data, error } = await supabase
        .from('cartoes_frota')
        .select('id, numero, tipo, status, limite, org_id')
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
        .select('id, numero, detentor, limite, org_id')
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

export interface AssociarCartaoArgs {
  cartaoId: string;
  numero: string;
  tipo: TipoCartao;
  motoristaId: string;
  orgId: string | null;
  /** Data de entrega (ISO, só dia) — injectada para o teste ser determinista. */
  hoje: string;
}

/**
 * O histórico é a única escrita que NÃO aborta a operação.
 *
 * É deliberado, e vem do comportamento original: sem o período registado o
 * combustível deste cartão entra por atribuir, mas desfazer a associação por
 * causa disso seria pior. Quem chama recebe o erro para o poder mostrar.
 */
export interface ResultadoAssociar {
  historicoFalhou?: string;
}

export function useAssociarCartaoAoMotorista() {
  const invalidar = useInvalidarCartoes();
  return useMutation({
    mutationFn: async ({
      cartaoId,
      numero,
      tipo,
      motoristaId,
      hoje,
      orgId,
    }: AssociarCartaoArgs): Promise<ResultadoAssociar> => {
      const { error: e1 } = await supabase
        .from('cartoes_frota')
        .update({ motorista_id: motoristaId, status: 'em_uso', data_entrega: hoje })
        .eq('id', cartaoId);
      if (e1) throw e1;

      // A ficha do motorista alimenta o match das transações importadas.
      const { error: e2 } = await supabase
        .from('motoristas_ativos')
        .update({ [colunaFicha(tipo)]: numero } as never)
        .eq('id', motoristaId);
      if (e2) throw e2;

      // Histórico de atribuição: é isto que decide de quem é o combustível de
      // cada dia.
      // `cartao_atribuicoes` ainda não está em types.ts (ficheiro gerado, não se
      // edita à mão) — o cast é o mesmo que o código original usava.
      const { error: e3 } = await (supabase as unknown as SupabaseSemTipos)
        .from('cartao_atribuicoes')
        .insert({
          org_id: orgId,
          cartao_id: cartaoId,
          motorista_id: motoristaId,
          de: hoje,
          origem: 'associacao',
        });
      return e3 ? { historicoFalhou: e3.message } : {};
    },
    onSuccess: (_r, { motoristaId }) => invalidar(motoristaId),
  });
}

export interface ResultadoDevolver {
  historicoFalhou?: string;
}

export interface DevolverCartaoArgs {
  cartaoId: string;
  tipo: TipoCartao;
  motoristaId: string;
  /** Só limpar a ficha se ela apontar mesmo para ESTE cartão. */
  limparFicha: boolean;
  hoje: string;
}

export function useDevolverCartaoDoMotorista() {
  const invalidar = useInvalidarCartoes();
  return useMutation({
    mutationFn: async ({
      cartaoId,
      tipo,
      motoristaId,
      limparFicha,
      hoje,
    }: DevolverCartaoArgs): Promise<ResultadoDevolver> => {
      const { error: e1 } = await supabase
        .from('cartoes_frota')
        .update({
          motorista_id: null,
          ultimo_motorista_id: motoristaId,
          status: 'disponivel',
          data_devolucao: hoje,
        })
        .eq('id', cartaoId);
      if (e1) throw e1;

      if (limparFicha) {
        const { error: e2 } = await supabase
          .from('motoristas_ativos')
          .update({ [colunaFicha(tipo)]: null } as never)
          .eq('id', motoristaId);
        if (e2) throw e2;
      }

      // Fecha o período no histórico. O que ele gastou até hoje continua dele
      // — devolver um cartão não reescreve o passado.
      const { error: e3 } = await (supabase as unknown as SupabaseSemTipos)
        .from('cartao_atribuicoes')
        .update({ ate: hoje })
        .eq('cartao_id', cartaoId)
        .eq('motorista_id', motoristaId)
        .is('ate', null);
      return e3 ? { historicoFalhou: e3.message } : {};
    },
    onSuccess: (_r, { motoristaId }) => invalidar(motoristaId),
  });
}

export interface SincronizarFichaArgs {
  motoristaId: string;
  tipo: TipoCartao;
  numero: string;
}

/** Repõe na ficha o número do cartão que o motorista tem mesmo atribuído. */
export function useSincronizarFichaCartao() {
  const invalidar = useInvalidarCartoes();
  return useMutation({
    mutationFn: async ({ motoristaId, tipo, numero }: SincronizarFichaArgs): Promise<void> => {
      const { error } = await supabase
        .from('motoristas_ativos')
        .update({ [colunaFicha(tipo)]: numero } as never)
        .eq('id', motoristaId);
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
