// Registo de uma emissão fiscal falhada em `failed_jobs`.
// TS puro, sem APIs de Deno: usado pela edge function faturacao-emitir e
// testado pelo Vitest (src/lib/faturacaoFalha.test.ts).

export type ClasseFalha = 'known_failed' | 'unknown';

export interface PedidoEmissaoResumido {
  tipo?: string;
  contrato_id?: string;
  cobranca_id?: string;
  emissor_id?: string;
  referencia_externa?: string;
  documento_referencia?: string;
  itens?: unknown[];
}

export interface ContextoFalhaEmissao {
  orgId: string | null;
  pedido: PedidoEmissaoResumido;
  erro: string;
  classe: ClasseFalha;
  provider?: string | null;
  integracaoId?: string | null;
  emissorId?: string | null;
}

export interface LinhaFailedJob {
  source_table: string;
  source_id: string;
  org_id: string;
  job_type: string;
  attempts: number;
  last_error: string;
  payload: Record<string, unknown>;
}

export const MAX_ERRO_FALHA = 2000;

/**
 * Linha para `failed_jobs`. Devolve null sem organização: a coluna é NOT NULL
 * e sem org não há a quem mostrar a falha. O payload só leva identificadores —
 * nunca NIF, morada ou itens do cliente.
 */
export function linhaDeFalhaEmissao(
  ctx: ContextoFalhaEmissao,
  idFallback: () => string = () => crypto.randomUUID()
): LinhaFailedJob | null {
  if (!ctx.orgId) return null;
  const { pedido } = ctx;
  const tipo = pedido.tipo ?? '?';
  const alvo = pedido.referencia_externa || pedido.documento_referencia || pedido.contrato_id || '';
  const provider = ctx.provider ?? 'provider por resolver';
  const cabecalho = `Emissão ${tipo} (${provider})${alvo ? ` · ${alvo}` : ''}: `;

  const origem = pedido.cobranca_id
    ? { source_table: 'contrato_cobrancas', source_id: pedido.cobranca_id }
    : pedido.contrato_id
      ? { source_table: 'contratos_renting', source_id: pedido.contrato_id }
      : { source_table: 'faturacao_emitir', source_id: idFallback() };

  return {
    ...origem,
    org_id: ctx.orgId,
    job_type: `faturacao.emitir.${tipo}`,
    attempts: 1,
    last_error: (cabecalho + ctx.erro).slice(0, MAX_ERRO_FALHA),
    payload: {
      action: 'emit',
      tipo,
      classe: ctx.classe,
      provider: ctx.provider ?? null,
      integracao_id: ctx.integracaoId ?? null,
      emissor_id: ctx.emissorId ?? pedido.emissor_id ?? null,
      contrato_id: pedido.contrato_id ?? null,
      cobranca_id: pedido.cobranca_id ?? null,
      referencia_externa: pedido.referencia_externa ?? null,
      documento_referencia: pedido.documento_referencia ?? null,
      n_itens: pedido.itens?.length ?? 0,
    },
  };
}
