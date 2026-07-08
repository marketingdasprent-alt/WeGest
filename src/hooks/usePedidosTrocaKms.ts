import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface PedidoTrocaKms {
  id: string;
  contrato_id: string;
  kms_incluidos_atual: number;
  kms_incluidos_pedido: number;
  km_adicional_valor_atual: number | null;
  km_adicional_valor_pedido: number | null;
  motivo: string;
  estado: 'pendente' | 'aceite' | 'recusado';
  resposta_motivo: string | null;
  created_at: string;
  contrato_codigo?: number | null;
}

/** Pedido pendente do contrato actual — usado para desactivar o botão enquanto já há um em curso. */
export function usePedidoTrocaKmsPendente(contratoId: string | null | undefined) {
  return useQuery({
    queryKey: ['pedidos-troca-kms', 'pendente', contratoId],
    queryFn: async (): Promise<PedidoTrocaKms | null> => {
      const { data, error } = await supabase
        .from('pedidos_troca_kms')
        .select(
          'id, contrato_id, kms_incluidos_atual, kms_incluidos_pedido, km_adicional_valor_atual, km_adicional_valor_pedido, motivo, estado, resposta_motivo, created_at'
        )
        .eq('contrato_id', contratoId as string)
        .eq('estado', 'pendente')
        .maybeSingle();
      if (error) throw error;
      return data as PedidoTrocaKms | null;
    },
    enabled: !!contratoId,
  });
}

/** Lista de pedidos pendentes de toda a org — usada pelo Supervisor Gestor TVDE. */
export function usePedidosTrocaKmsPendentes() {
  return useQuery({
    queryKey: ['pedidos-troca-kms', 'pendentes-org'],
    queryFn: async (): Promise<PedidoTrocaKms[]> => {
      const { data, error } = await supabase
        .from('pedidos_troca_kms')
        .select(
          'id, contrato_id, kms_incluidos_atual, kms_incluidos_pedido, km_adicional_valor_atual, km_adicional_valor_pedido, motivo, estado, resposta_motivo, created_at, contratos_renting(codigo)'
        )
        .eq('estado', 'pendente')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        ...p,
        contrato_codigo: p.contratos_renting?.codigo ?? null,
      })) as PedidoTrocaKms[];
    },
  });
}

interface CriarPedidoArgs {
  contratoId: string;
  kmsIncluidosAtual: number;
  kmsIncluidosPedido: number;
  kmAdicionalValorAtual: number | null;
  kmAdicionalValorPedido: number | null;
  motivo: string;
}

export function useCriarPedidoTrocaKms() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (args: CriarPedidoArgs) => {
      const { data: orgRow } = await supabase.from('user_org_ativa').select('org_id').maybeSingle();
      const orgId = orgRow?.org_id;
      if (!orgId) throw new Error('Sem organização activa.');

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from('pedidos_troca_kms').insert({
        org_id: orgId,
        contrato_id: args.contratoId,
        kms_incluidos_atual: args.kmsIncluidosAtual,
        kms_incluidos_pedido: args.kmsIncluidosPedido,
        km_adicional_valor_atual: args.kmAdicionalValorAtual,
        km_adicional_valor_pedido: args.kmAdicionalValorPedido,
        motivo: args.motivo,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['pedidos-troca-kms', 'pendente', variables.contratoId] });
      toast({
        title: 'Pedido enviado',
        description: 'O Supervisor Gestor TVDE vai avaliar o pedido de alteração de kms.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao enviar pedido',
        description: error.message || 'Tenta novamente.',
        variant: 'destructive',
      });
    },
  });
}

export function useResponderPedidoTrocaKms() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      pedidoId,
      aceite,
      respostaMotivo,
    }: {
      pedidoId: string;
      aceite: boolean;
      respostaMotivo?: string;
    }) => {
      const { error } = await supabase.rpc('responder_pedido_troca_kms', {
        p_pedido_id: pedidoId,
        p_aceite: aceite,
        p_resposta_motivo: respostaMotivo ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['pedidos-troca-kms'] });
      qc.invalidateQueries({ queryKey: ['renting', 'contratos'] });
      toast({
        title: variables.aceite ? 'Pedido aceite' : 'Pedido recusado',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao responder pedido',
        description: error.message || 'Tenta novamente.',
        variant: 'destructive',
      });
    },
  });
}
