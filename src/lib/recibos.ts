import { supabase } from '@/integrations/supabase/client';
import { semCodigo } from '@/types/codigoPorOrg';
import type { InvoiceMetadata } from '@/types/faturacao';
import { carregarClienteParaFatura, emitirDocumento } from '@/lib/faturacao';
import { ErroRecibo, explicarErroRecibo, type ErroReciboExplicado } from '@/lib/reciboErro';

/** Fatura em aberto sobre a qual se faz o recibo. */
export interface CobrancaParaRecibo {
  id: string;
  descricao: string | null;
  saldoPagar: number;
  destinatario_id: string;
  destinatario_nome: string;
  contrato_id: string | null;
  documento_externo_ref: string | null;
}

export interface DadosPagamento {
  valor: number;
  metodo: string;
  /** yyyy-MM-dd */
  data: string;
  observacoes?: string;
}

export interface ReciboRegistado {
  reciboId: string;
  /** Nº do recibo no KeyInvoice; null quando a fatura não tem documento fiscal. */
  numeroFiscal: string | null;
  invoice: InvoiceMetadata | null;
  aviso: string | null;
}

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

async function emitirReciboFiscal(cobranca: CobrancaParaRecibo, pag: DadosPagamento, obs: string) {
  const cliente = await carregarClienteParaFatura(
    cobranca.destinatario_id,
    cobranca.destinatario_nome
  );
  return emitirDocumento({
    tipo: 'RC',
    cliente,
    itens: [
      {
        descricao: `Recibo de ${cobranca.documento_externo_ref}`,
        quantidade: 1,
        preco_unitario: pag.valor,
        taxa_iva: 0,
      },
    ],
    contrato_id: cobranca.contrato_id ?? undefined,
    cobranca_id: cobranca.id,
    documento_referencia: cobranca.documento_externo_ref ?? undefined,
    referencia_externa: cobranca.documento_externo_ref ?? undefined,
    observacoes: obs,
  });
}

/**
 * Regista um recibo. O KeyInvoice vem primeiro: só se ele aceitar é que a
 * fatura fica paga no WeGest — antes era ao contrário e uma recusa deixava a
 * fatura paga cá e por pagar lá, sem ninguém saber. Falhas saem como ErroRecibo.
 */
export async function registarRecibo(
  orgId: string,
  cobranca: CobrancaParaRecibo,
  pag: DadosPagamento
): Promise<ReciboRegistado> {
  const valor = round2(pag.valor);
  const obs =
    pag.observacoes?.trim() ||
    `Liquidação de ${cobranca.documento_externo_ref || cobranca.descricao || 'fatura'}`;

  let numeroFiscal: string | null = null;
  let invoice: InvoiceMetadata | null = null;
  const avisos: string[] = [];

  if (cobranca.documento_externo_ref) {
    try {
      const res = await emitirReciboFiscal(cobranca, { ...pag, valor }, obs);
      numeroFiscal = res.provider?.FullDocNumber ?? res.invoice?.numero ?? null;
      invoice = res.invoice ?? null;
      if (res.warning) avisos.push(res.warning);
    } catch (e: unknown) {
      throw new ErroRecibo(explicarErroRecibo(e, 'keyinvoice'));
    }
  }

  const faseGravar = numeroFiscal ? 'gravar_apos_keyinvoice' : 'gravar';
  const { data: recibo, error } = await supabase
    .from('recibos')
    .insert(
      semCodigo<'recibos'>({
        org_id: orgId,
        entidade_id: cobranca.destinatario_id,
        contrato_id: cobranca.contrato_id,
        valor,
        data_recibo: pag.data,
        metodo: pag.metodo,
        observacoes: obs,
        referencia: cobranca.id,
        estado: 'ativo',
        documento_externo_ref: numeroFiscal,
      })
    )
    .select('id')
    .single();
  if (error || !recibo) {
    throw new ErroRecibo(explicarErroRecibo(error, faseGravar, numeroFiscal));
  }

  if (valor >= cobranca.saldoPagar - 0.005) {
    const { error: pagaErr } = await supabase
      .from('contrato_cobrancas')
      .update({ estado: 'paga', pago_em: new Date().toISOString() })
      .eq('id', cobranca.id)
      .eq('estado', 'emitida');
    if (pagaErr) {
      avisos.push(`Recibo guardado, mas a fatura não ficou marcada como paga: ${pagaErr.message}`);
    }
  }

  return { reciboId: recibo.id, numeroFiscal, invoice, aviso: avisos.join(' ') || null };
}

export type ResultadoRecibo =
  | { cobranca: CobrancaParaRecibo; ok: true; recibo: ReciboRegistado }
  | { cobranca: CobrancaParaRecibo; ok: false; erro: ErroReciboExplicado };

/**
 * Um recibo por fatura, pelo valor todo em aberto, um de cada vez (o KeyInvoice
 * numera em sequência). Uma falha não pára as seguintes.
 */
export async function registarRecibosEmLote(
  orgId: string,
  cobrancas: CobrancaParaRecibo[],
  pag: Omit<DadosPagamento, 'valor'>,
  onProgresso?: (feitos: number, total: number) => void,
  registar: typeof registarRecibo = registarRecibo
): Promise<ResultadoRecibo[]> {
  const resultados: ResultadoRecibo[] = [];
  for (const cobranca of cobrancas) {
    try {
      const recibo = await registar(orgId, cobranca, { ...pag, valor: cobranca.saldoPagar });
      resultados.push({ cobranca, ok: true, recibo });
    } catch (e: unknown) {
      const erro = e instanceof ErroRecibo ? e.explicacao : explicarErroRecibo(e, 'gravar');
      resultados.push({ cobranca, ok: false, erro });
    }
    onProgresso?.(resultados.length, cobrancas.length);
  }
  return resultados;
}
