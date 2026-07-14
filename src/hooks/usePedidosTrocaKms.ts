import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type TipoPedidoAlteracao = 'kms' | 'franquia' | 'tarifa';

export interface PedidoTrocaKms {
  id: string;
  contrato_id: string;
  tipo: TipoPedidoAlteracao;
  valor_atual: number;
  valor_pedido: number;
  /** Só populado quando tipo='kms' — valor do €/km adicional. */
  km_adicional_valor_atual: number | null;
  km_adicional_valor_pedido: number | null;
  motivo: string;
  estado: 'pendente' | 'aceite' | 'recusado';
  resposta_motivo: string | null;
  respondido_por?: string | null;
  respondido_em?: string | null;
  created_at: string;
  contrato_codigo?: number | null;
  respondido_por_nome?: string | null;
}

const PEDIDO_SELECT =
  'id, contrato_id, tipo, valor_atual, valor_pedido, km_adicional_valor_atual, km_adicional_valor_pedido, motivo, estado, resposta_motivo, respondido_por, respondido_em, created_at, contratos_renting(codigo)';

async function anexarNomesRespondentes(pedidos: any[]): Promise<PedidoTrocaKms[]> {
  const idsRespondentes = [
    ...new Set(pedidos.map((p) => p.respondido_por).filter((id): id is string => !!id)),
  ];
  let nomeMap: Record<string, string> = {};
  if (idsRespondentes.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, nome')
      .in('id', idsRespondentes);
    nomeMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.nome ?? '']));
  }
  return pedidos.map((p) => ({
    ...p,
    contrato_codigo: p.contratos_renting?.codigo ?? null,
    respondido_por_nome: p.respondido_por ? (nomeMap[p.respondido_por] ?? null) : null,
  })) as PedidoTrocaKms[];
}

/** Pedido pendente do contrato actual para um tipo — usado para desactivar o botão enquanto já há um em curso. */
export function usePedidoTrocaKmsPendente(
  contratoId: string | null | undefined,
  tipo: TipoPedidoAlteracao = 'kms'
) {
  return useQuery({
    queryKey: ['pedidos-troca-kms', 'pendente', contratoId, tipo],
    queryFn: async (): Promise<PedidoTrocaKms | null> => {
      const { data, error } = await supabase
        .from('pedidos_alteracao_contrato')
        .select(
          'id, contrato_id, tipo, valor_atual, valor_pedido, km_adicional_valor_atual, km_adicional_valor_pedido, motivo, estado, resposta_motivo, created_at'
        )
        .eq('contrato_id', contratoId as string)
        .eq('tipo', tipo)
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
        .from('pedidos_alteracao_contrato')
        .select(PEDIDO_SELECT)
        .eq('estado', 'pendente')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return anexarNomesRespondentes(data ?? []);
    },
  });
}

/** Histórico de pedidos já respondidos (aceites/recusados) — consulta do Supervisor Gestor TVDE. */
export function usePedidosTrocaKmsHistorico() {
  return useQuery({
    queryKey: ['pedidos-troca-kms', 'historico-org'],
    queryFn: async (): Promise<PedidoTrocaKms[]> => {
      const { data, error } = await supabase
        .from('pedidos_alteracao_contrato')
        .select(PEDIDO_SELECT)
        .in('estado', ['aceite', 'recusado'])
        .order('respondido_em', { ascending: false });
      if (error) throw error;
      return anexarNomesRespondentes(data ?? []);
    },
  });
}

interface CriarPedidoArgs {
  contratoId: string;
  tipo: TipoPedidoAlteracao;
  valorAtual: number;
  valorPedido: number;
  /** Só para tipo='kms'. */
  kmAdicionalValorAtual?: number | null;
  kmAdicionalValorPedido?: number | null;
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

      const { error } = await supabase.from('pedidos_alteracao_contrato').insert({
        org_id: orgId,
        contrato_id: args.contratoId,
        tipo: args.tipo,
        valor_atual: args.valorAtual,
        valor_pedido: args.valorPedido,
        km_adicional_valor_atual: args.kmAdicionalValorAtual ?? null,
        km_adicional_valor_pedido: args.kmAdicionalValorPedido ?? null,
        motivo: args.motivo,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: ['pedidos-troca-kms', 'pendente', variables.contratoId, variables.tipo],
      });
      const label =
        variables.tipo === 'franquia' ? 'franquia' : variables.tipo === 'tarifa' ? 'tarifa' : 'kms';
      toast({
        title: 'Pedido enviado',
        description: `O Supervisor Gestor TVDE vai avaliar o pedido de alteração de ${label}.`,
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
        p_resposta_motivo: respostaMotivo,
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
