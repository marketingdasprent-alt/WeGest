// Registe primeiro localmente; falhas no provider deixam a parcela pendente,
// sem perder o pagamento nem marcar paga sem recibo.
import { supabase } from '@/integrations/supabase/client';
import { emitirDocumento, clienteRowToFatura } from './faturacao';

export interface RegistarPagamentoInput {
  parcelaId: string;
  acordoId: string;
  entidadeId: string;
  contratoId: string | null;
  cobrancaId: string;
  valor: number;
  data: string;
  metodo: string;
  numeroFaturaOriginal: string | null;
  titular: {
    nome: string;
    nif?: string | null;
    email?: string | null;
    morada?: string | null;
    codigo_postal?: string | null;
    localidade?: string | null;
  };
  parcelaNumero: number;
  totalParcelas: number;
  acordoCodigo: number;
}

export interface RegistarPagamentoResult {
  estado: 'paga' | 'liquidacao_pendente';
  erro?: string;
}

// O provider não aceita chave de idempotência; esta marca permite reconciliar emissões.
export function marcaCorrelacao(parcelaId: string): string {
  return `WG-IDK:${parcelaId}`;
}

export async function registarPagamentoParcela(
  input: RegistarPagamentoInput
): Promise<RegistarPagamentoResult> {
  const descricao =
    `Parcela ${input.parcelaNumero}/${input.totalParcelas} do acordo ACD-${input.acordoCodigo} · ` +
    marcaCorrelacao(input.parcelaId);

  const temDocumentoFiscal = !!input.numeroFaturaOriginal;
  const idempotencyKey = `RC:parcela:${input.parcelaId}`;

  const payload = temDocumentoFiscal
    ? {
        tipo: 'RC' as const,
        cliente: clienteRowToFatura(input.titular, input.titular.nome),
        itens: [
          {
            descricao: `Recibo de ${input.numeroFaturaOriginal}`,
            quantidade: 1,
            preco_unitario: input.valor,
            taxa_iva: 0,
          },
        ],
        contrato_id: input.contratoId ?? undefined,
        cobranca_id: input.cobrancaId,
        documento_referencia: input.numeroFaturaOriginal,
        referencia_externa: input.numeroFaturaOriginal,
        observacoes: descricao,
      }
    : null;

  // A RPC grava recibo, parcela e outbox atomicamente para evitar reentrância.
  const { data, error: rpcErr } = await supabase.rpc('acordo_parcela_registar_pagamento' as any, {
    p_parcela_id: input.parcelaId,
    p_valor: input.valor,
    p_data: input.data,
    p_metodo: input.metodo,
    p_entidade_id: input.entidadeId,
    p_contrato_id: input.contratoId,
    p_cobranca_id: input.cobrancaId,
    p_descricao: descricao,
    p_tem_documento_fiscal: temDocumentoFiscal,
    p_payload: payload,
  });
  if (rpcErr) throw rpcErr;

  const resultado = data as unknown as {
    recibo_id: string;
    estado: 'paga' | 'liquidacao_pendente';
  };

  if (resultado.estado === 'paga') {
    return { estado: 'paga' };
  }

  // Este catch classifica apenas a emissão; a liquidação ocorre fora dele.
  let res: Awaited<ReturnType<typeof emitirDocumento>>;
  try {
    res = await emitirDocumento(payload!);
  } catch (e) {
    // Só `known_failed` pode reagendar; estados incertos exigem reconciliação.
    const classe = (e as Error & { classe?: 'known_failed' | 'unknown' })?.classe;
    if (classe === 'known_failed') {
      await supabase
        .from('faturacao_outbox' as any)
        .update({ estado: 'pendente', ultimo_erro: (e as Error).message })
        .eq('idempotency_key', idempotencyKey);
    } else {
      await supabase
        .from('faturacao_outbox' as any)
        .update({
          estado: 'suspenso',
          needs_reconcile: true,
          ultimo_erro: (e as Error).message,
        })
        .eq('idempotency_key', idempotencyKey);
    }
    return { estado: 'liquidacao_pendente', erro: (e as Error).message };
  }

  // Não capture a liquidação: o documento pode já existir e uma repetição criaria
  // um segundo recibo; `res.invoice` é opcional após falha no espelho local.
  const { error: liquidarErr } = await supabase.rpc('acordo_parcela_liquidar' as any, {
    p_parcela_id: input.parcelaId,
    p_invoice_id: res.invoice?.id ?? null,
  });
  if (liquidarErr) throw liquidarErr;

  // Best-effort: a liquidação já sucedeu, mas a referência distingue recibos parcelados.
  const fullDocNumber = res.provider?.FullDocNumber ?? res.invoice?.numero ?? null;
  if (fullDocNumber) {
    const { error: reciboRefErr } = await supabase
      .from('recibos')
      .update({ documento_externo_ref: fullDocNumber })
      .eq('id', resultado.recibo_id)
      .is('documento_externo_ref', null);
    if (reciboRefErr) {
      console.warn('Falha (não crítica) a gravar documento_externo_ref no recibo:', reciboRefErr);
    }
  }

  // Best-effort: a liquidação já sucedeu e o reaper corrige a outbox depois.
  const { error: outboxSucessoErr } = await supabase
    .from('faturacao_outbox' as any)
    .update({ estado: 'sucesso', invoice_id: res.invoice?.id ?? null })
    .eq('idempotency_key', idempotencyKey);
  if (outboxSucessoErr) {
    console.warn('Falha (não crítica) a marcar outbox como sucesso:', outboxSucessoErr);
  }
  return { estado: 'paga' };
}
