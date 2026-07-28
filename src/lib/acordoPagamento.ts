/**
 * Registo do pagamento de uma parcela de acordo.
 *
 * Ordem deliberada: o dinheiro é gravado LOCALMENTE antes de se falar com o
 * provider. Se a emissão do recibo falhar, a conta-corrente já está correta e a
 * parcela fica em `liquidacao_pendente` — nunca se perde um pagamento por a API
 * estar em baixo, e nunca se marca uma parcela como paga sem recibo.
 */
import { supabase } from '@/integrations/supabase/client';
import { emitirDocumento, clienteRowToFatura } from './faturacao';

export interface RegistarPagamentoInput {
  parcelaId: string;
  acordoId: string;
  /** Conta-corrente onde entra o crédito: o RESPONSÁVEL pelo acordo. */
  entidadeId: string;
  contratoId: string | null;
  cobrancaId: string;
  valor: number;
  /** ISO `YYYY-MM-DD`. */
  data: string;
  metodo: string;
  /** Nº legal da fatura original. Null = cobrança sem documento fiscal. */
  numeroFaturaOriginal: string | null;
  /** TITULAR da fatura — é o NIF que vai no recibo. Nunca o responsável. */
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

/**
 * Marca de correlação que viaja DENTRO do documento no provider.
 * A API não aceita chave de idempotência; esta marca é o que permite, mais
 * tarde, descobrir se um recibo chegou a ser emitido.
 */
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
        // TITULAR, não o responsável: o recibo herda o NIF da fatura que referencia.
        cliente: clienteRowToFatura(input.titular, input.titular.nome),
        itens: [
          {
            descricao: `Recibo de ${input.numeroFaturaOriginal}`,
            quantidade: 1,
            preco_unitario: input.valor,
            // O IVA foi liquidado na fatura original — um recibo não é transmissão tributável.
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

  // ① Registo atómico do pagamento: recibo + parcela + (se fiscal) outbox,
  // tudo numa única transação com guarda de reentrância — corrige o Critical
  // de não-atomicidade da revisão final da branch (migração 20260724100005).
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
    // Cobrança sem documento fiscal — já liquidada pela própria RPC.
    return { estado: 'paga' };
  }

  // ② A partir daqui existe uma linha de outbox 'em_curso' com a idempotency
  // key desta parcela. O try/catch cobre APENAS emitirDocumento(): uma falha ali (known_failed ou
  // unknown) é a única coisa que o bloco catch abaixo sabe classificar. A RPC de
  // liquidação, mais abaixo, corre FORA deste try de propósito — ver o comentário
  // junto a essa chamada.
  let res: Awaited<ReturnType<typeof emitirDocumento>>;
  try {
    res = await emitirDocumento(payload!);
  } catch (e) {
    // `classe`, anexado ao erro por emitirDocumento(), distingue:
    //  • known_failed — confirma-se que nada foi criado. Seguro reagendar
    //    automaticamente (outbox volta a 'pendente').
    //  • unknown, ou AUSENTE (ex.: nem se conseguiu contactar a função) — não
    //    se sabe se foi criado. NUNCA reemitir sem reconciliar primeiro —
    //    suspende para intervenção manual. Ausência de classe cai aqui por
    //    omissão SEGURA, não por acaso.
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

  // emitirDocumento() só devolve controlo quando o provider confirmou sucesso
  // — QUALQUER falha (known_failed ou unknown) chega ao catch acima como
  // excepção, nunca como retorno com success:false. Não existe "else" a
  // tratar aqui.
  //
  // res.invoice pode faltar mesmo com sucesso: é o caso em que o documento
  // foi emitido no provider mas a gravação do espelho local em `invoices`
  // falhou depois (o "warning" da edge function). O documento é real;
  // liquida-se na mesma, só sem o invoice_rc_id para o ligar.
  //
  // Esta chamada fica FORA do try/catch acima de propósito: uma falha aqui é
  // qualitativamente diferente de uma falha em emitirDocumento() — o
  // documento fiscal já foi emitido no provider, só a promoção local a 'paga'
  // é que falhou. Tratá-la como known_failed/unknown reagendaria (ou
  // suspenderia) a emissão como se nada tivesse sido criado, arriscando um
  // SEGUNDO documento para o mesmo pagamento. Por isso propaga-se sempre —
  // nunca se devolve {estado: 'paga'} sem a BD confirmar a promoção.
  const { error: liquidarErr } = await supabase.rpc('acordo_parcela_liquidar' as any, {
    p_parcela_id: input.parcelaId,
    p_invoice_id: res.invoice?.id ?? null,
  });
  if (liquidarErr) throw liquidarErr;

  // Best-effort: a liquidação (linha acima) já teve sucesso — o pagamento
  // está correcto independentemente disto. Um erro aqui só atrasa a outbox
  // em ficar 'sucesso'; o reaper (Tarefa 5) varre ao fim de 10 min.
  const { error: outboxSucessoErr } = await supabase
    .from('faturacao_outbox' as any)
    .update({ estado: 'sucesso', invoice_id: res.invoice?.id ?? null })
    .eq('idempotency_key', idempotencyKey);
  if (outboxSucessoErr) {
    console.warn('Falha (não crítica) a marcar outbox como sucesso:', outboxSucessoErr);
  }
  return { estado: 'paga' };
}
