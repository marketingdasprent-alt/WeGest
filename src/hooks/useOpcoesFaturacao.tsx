import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { buscarOpcoesFaturacao, type ContextoFaturacao } from '@/lib/faturacao';
import { EscolherFornecedorDialog } from '@/components/faturacao/EscolherFornecedorDialog';
import { preSelecao } from '../../supabase/functions/_shared/faturacao/escolha';
import type { OpcaoFornecedor, TipoFatura } from '@/types/faturacao';

const chave = (tipo: TipoFatura, ctx: ContextoFaturacao) =>
  ['faturacao-opcoes', { tipo, ...ctx }] as const;
const temContexto = (ctx: ContextoFaturacao) =>
  !!(ctx.contrato_id || ctx.reserva_id || ctx.cobranca_id);

export function useOpcoesFaturacao(tipo: TipoFatura, ctx: ContextoFaturacao, enabled = true) {
  return useQuery({
    queryKey: chave(tipo, ctx),
    queryFn: () => buscarOpcoesFaturacao(tipo, ctx),
    enabled: enabled && temContexto(ctx),
    staleTime: 30_000,
  });
}

export function useEscolhaFornecedor(tipo: TipoFatura, ctx: ContextoFaturacao, enabled = true) {
  const q = useOpcoesFaturacao(tipo, ctx, enabled);
  const [escolhida, setIntegracaoId] = useState<string | null>(null);
  const opcoes = q.data ?? [];
  // A escolha só vale enquanto estiver disponível (ex.: mudou de Fatura para Fatura-Recibo).
  const valida = opcoes.some((o) => o.disponivel && o.integracao_id === escolhida)
    ? escolhida
    : null;
  const integracaoId = valida ?? preSelecao(opcoes);
  const disponiveis = opcoes.filter((o) => o.disponivel).length;
  return {
    opcoes,
    isLoading: q.isLoading, // v5: só true quando está mesmo a buscar (enabled=false dá false)
    error: (q.error as Error | null) ?? null,
    integracaoId,
    setIntegracaoId,
    providerLabel: integracaoId
      ? (opcoes.find((o) => o.integracao_id === integracaoId)?.label ?? null)
      : null,
    bloqueiaConfirmar: q.isLoading || (disponiveis > 1 && !integracaoId),
  };
}

export type EscolhaFornecedor = ReturnType<typeof useEscolhaFornecedor>;

/** Para ações de linha (Reemitir, Emitir FR do slot): só dispensa o diálogo com uma única opção. */
export function usePedirFornecedor() {
  const qc = useQueryClient();
  const [pedido, setPedido] = useState<{
    opcoes: OpcaoFornecedor[];
    resolver: (r: { integracaoId: string | null } | 'cancelado') => void;
  } | null>(null);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  // Um pedido novo cancela o que ainda espera, para a promessa anterior nunca ficar pendurada.
  const resolverAtual = useRef<((r: 'cancelado') => void) | null>(null);

  const pedir = useCallback(
    async (tipo: TipoFatura, ctx: ContextoFaturacao) => {
      const opcoes = await qc.fetchQuery({
        queryKey: chave(tipo, ctx),
        queryFn: () => buscarOpcoesFaturacao(tipo, ctx),
        staleTime: 30_000,
      });
      const disponiveis = opcoes.filter((o) => o.disponivel && o.integracao_id);
      if (disponiveis.length === 0) return { integracaoId: null };
      if (disponiveis.length === 1) return { integracaoId: disponiveis[0].integracao_id };
      // Com duas, pergunta sempre: se o fornecedor da última vez estiver em baixo, troca-se aqui.
      resolverAtual.current?.('cancelado');
      setEscolhida(preSelecao(opcoes));
      return new Promise<{ integracaoId: string | null } | 'cancelado'>((resolver) => {
        resolverAtual.current = resolver;
        setPedido({ opcoes, resolver });
      });
    },
    [qc]
  );

  const fechar = (r: { integracaoId: string | null } | 'cancelado') => {
    pedido?.resolver(r);
    resolverAtual.current = null;
    setPedido(null);
  };

  const dialogo = (
    <EscolherFornecedorDialog
      open={!!pedido}
      opcoes={pedido?.opcoes ?? []}
      integracaoId={escolhida}
      onChange={setEscolhida}
      onConfirmar={() => fechar({ integracaoId: escolhida })}
      onCancelar={() => fechar('cancelado')}
    />
  );
  return { pedir, dialogo };
}
