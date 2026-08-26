import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Cartões de frota (BP / Repsol / EDP) na perspectiva do motorista.
 *
 * Extraído de MotoristaCartoesFrota, que fazia sete `supabase.from()` directos
 * com `useState` + `useEffect` + um `refetchAll()` chamado à mão.
 *
 * NOTA SOBRE ATOMICIDADE (comportamento preservado, não corrigido aqui)
 * Associar e devolver escrevem em DUAS tabelas — `cartoes_frota` e a coluna
 * `cartao_<tipo>` da ficha em `motoristas_ativos` (que serve o match das
 * transações importadas). São duas chamadas PostgREST, sem transação: se a
 * segunda falhar, o cartão fica atribuído e a ficha não. Fechar isto a sério
 * exige uma RPC `SECURITY DEFINER` que faça as duas escritas numa transacção —
 * está fora do âmbito desta extracção, que não muda comportamento. O que se
 * garante já é que a primeira falha aborta antes da segunda escrita.
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

/** A coluna da ficha do motorista que guarda o número deste tipo de cartão. */
const colunaFicha = (tipo: TipoCartao) => `cartao_${tipo}`;

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

export interface AssociarCartaoArgs {
  cartaoId: string;
  numero: string;
  tipo: TipoCartao;
  motoristaId: string;
  /** Data de entrega (ISO, só dia) — injectada para o teste ser determinista. */
  hoje: string;
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
    }: AssociarCartaoArgs): Promise<void> => {
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
    },
    onSuccess: (_r, { motoristaId }) => invalidar(motoristaId),
  });
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
    }: DevolverCartaoArgs): Promise<void> => {
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
