// Que fatura (e que documento do fornecedor) refere um pedido de PDF de um documento já emitido.
// TS puro, sem Deno: usado pela edge function faturacao-emitir e testado pelo Vitest
// (src/lib/documentoConsultado.test.ts).

export interface PedidoDocumento {
  invoice_id?: string;
  provider_doctype?: string;
  provider_docnum?: string;
  serie?: string;
}

export interface FaturaDoDocumento {
  integracao_id: string | null;
  contrato_id: string | null;
  cobranca_id: string | null;
  provider_doctype: string | null;
  provider_docnum: string | null;
  serie: string | null;
}

export type DocumentoConsultado = Omit<PedidoDocumento, 'invoice_id'>;

/** O mínimo do query builder do supabase-js usado aqui; deixa testar sem cliente real. */
export interface ConsultaFaturas {
  eq(coluna: string, valor: string): ConsultaFaturas;
  order(coluna: string, opcoes: { ascending: boolean }): ConsultaFaturas;
  limit(n: number): ConsultaFaturas;
  maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface BdFaturas {
  from(tabela: 'invoices'): { select(colunas: string): ConsultaFaturas };
}

export class DocumentoNaoEncontradoError extends Error {}

const COLUNAS = 'integracao_id, contrato_id, cobranca_id, provider_doctype, provider_docnum, serie';

/**
 * A fatura do pedido, sempre dentro da org de quem pede. Pelo id quando vem: duas empresas da
 * org podem ter o mesmo FA 2026/50, e só o id diz qual é. Sem id (clientes antigos) cai no
 * número, como antes.
 */
export async function faturaDoDocumento(
  db: BdFaturas,
  orgId: string,
  pedido: PedidoDocumento
): Promise<FaturaDoDocumento | null> {
  const consulta = () => db.from('invoices').select(COLUNAS).eq('org_id', orgId);
  if (pedido.invoice_id) {
    const { data, error } = await consulta().eq('id', pedido.invoice_id).maybeSingle();
    if (error) throw new Error(`Falha a ler a fatura: ${error.message}`);
    if (!data) throw new DocumentoNaoEncontradoError('Documento não encontrado nesta organização.');
    return data as FaturaDoDocumento;
  }
  if (!pedido.provider_docnum) return null;
  let q = consulta().eq('provider_docnum', pedido.provider_docnum);
  if (pedido.provider_doctype) q = q.eq('provider_doctype', pedido.provider_doctype);
  if (pedido.serie) q = q.eq('serie', pedido.serie);
  const { data } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data as FaturaDoDocumento | null) ?? null;
}

/** O documento a pedir ao fornecedor: o da fatura encontrada, senão o que o chamador mandou. */
export function documentoDaConsulta(
  fatura: FaturaDoDocumento | null,
  pedido: PedidoDocumento
): DocumentoConsultado {
  if (!fatura?.provider_docnum) {
    return {
      provider_doctype: pedido.provider_doctype,
      provider_docnum: pedido.provider_docnum,
      serie: pedido.serie,
    };
  }
  return {
    provider_doctype: fatura.provider_doctype ?? pedido.provider_doctype,
    provider_docnum: fatura.provider_docnum,
    serie: fatura.serie ?? pedido.serie,
  };
}
