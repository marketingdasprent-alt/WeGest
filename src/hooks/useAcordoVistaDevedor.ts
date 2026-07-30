import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AcordoVistaDevedorParcela {
  numero: number;
  dataVencimento: string;
  valor: number;
  /** Já normalizado pela própria RPC: liquidacao_pendente aparece como 'paga'. */
  estado: string;
  temRecibo: boolean;
}

export interface AcordoVistaDevedor {
  id: string;
  codigo: number;
  estado: string;
  valorTotal: number;
  faltaPagar: number;
  parcelas: AcordoVistaDevedorParcela[];
}

/**
 * Vista do devedor sobre o próprio acordo — via RPC acordo_vista_devedor (backend
 * Tarefa 4), SECURITY DEFINER, que já esconde titular_nif e qualquer estado interno de
 * outbox/API do lado do servidor. Só motorista (ver spec §3.0/§3.4) — a RPC não tem
 * ramo de autorização para cliente/condutor.
 */
export function useAcordoVistaDevedor(acordoId: string | null | undefined) {
  return useQuery({
    queryKey: ['acordo-vista-devedor', acordoId ?? null],
    queryFn: async (): Promise<AcordoVistaDevedor | null> => {
      if (!acordoId) return null;
      // RPC criada na mesma migração ainda sem tipos gerados em
      // src/integrations/supabase/types.ts — daqui o `as any`, mesmo padrão de
      // cobranca_saldo_por_liquidar/acordo_parcela_liquidar nesta feature.
      const { data, error } = await supabase.rpc('acordo_vista_devedor' as any, {
        p_acordo_id: acordoId,
      });
      if (error) throw error;
      const r = data as unknown as {
        id: string;
        codigo: number;
        estado: string;
        valor_total: number;
        falta_pagar: number;
        parcelas: Array<{
          numero: number;
          data_vencimento: string;
          valor: number;
          estado: string;
          tem_recibo: boolean;
        }>;
      };
      return {
        id: r.id,
        codigo: r.codigo,
        estado: r.estado,
        valorTotal: Number(r.valor_total),
        faltaPagar: Number(r.falta_pagar),
        parcelas: r.parcelas.map((p) => ({
          numero: p.numero,
          dataVencimento: p.data_vencimento,
          valor: Number(p.valor),
          estado: p.estado,
          temRecibo: p.tem_recibo,
        })),
      };
    },
    // SEM `enabled: !!acordoId` de propósito: numa query desativada o TanStack Query v5
    // fica para sempre em status 'pending' (nunca 'success'), o que quebraria qualquer
    // consumidor que espere `isSuccess`/`data: null` já resolvido sem acordoId (ex.: o
    // AcordoDetalhePanel a alternar entre esta hook e useAcordoDetalhe por `modo`). O
    // guard `if (!acordoId) return null;` acima já garante que a RPC nunca é chamada.
  });
}

export interface MeuAcordoAtivo {
  id: string;
  codigo: number;
  faltaPagar: number;
}

/**
 * Os acordos de pagamento em que o utilizador autenticado é o MOTORISTA
 * responsável (papel de devedor) — via RPC motorista_meus_acordos_ativos
 * (SECURITY DEFINER, mesmo padrão de auth de acordo_vista_devedor: resolve
 * auth.uid() -> motoristas_ativos.id internamente). Existe para o painel do
 * motorista poder mostrar um atalho para /motorista/painel/acordos/:id —
 * RLS de acordos_pagamento é só staff, por isso o motorista não pode listar
 * os próprios acordos com uma query direta. Devolve [] para quem não é
 * motorista (ou não tem nenhum acordo ativo) — nunca erro.
 */
export function useMeusAcordosAtivos() {
  return useQuery({
    queryKey: ['meus-acordos-ativos'],
    queryFn: async (): Promise<MeuAcordoAtivo[]> => {
      const { data, error } = await supabase.rpc('motorista_meus_acordos_ativos' as any, {});
      if (error) throw error;
      const lista = (data ?? []) as Array<{ id: string; codigo: number; falta_pagar: number }>;
      return lista.map((a) => ({
        id: a.id,
        codigo: a.codigo,
        faltaPagar: Number(a.falta_pagar),
      }));
    },
  });
}
