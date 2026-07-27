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
  orgId: string;
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

  // ① Dinheiro primeiro. O trigger fn_recibo_posta_movimento posta o crédito.
  const { data: recibo, error: reciboErr } = await supabase
    .from('recibos')
    .insert({
      org_id: input.orgId,
      entidade_id: input.entidadeId,
      contrato_id: input.contratoId,
      valor: input.valor,
      data_recibo: input.data,
      metodo: input.metodo,
      referencia: input.cobrancaId,
      observacoes: descricao,
      estado: 'ativo',
    })
    .select()
    .single();

  if (reciboErr) throw reciboErr;

  // `acordo_parcelas`, `faturacao_outbox` e a RPC `acordo_parcela_liquidar`
  // já existem na BD (migrations 20260724100000/2/3) mas `types.ts` ainda não
  // foi regenerado para os incluir — as tarefas 1-6 deste plano só tocaram
  // SQL/edge function, nunca este ficheiro gerado. `as any` é o mesmo idioma
  // já usado em HistoricoEnviosDialog.tsx para 'marketing_envio_detalhes'.
  // Regenerar types.ts fica fora do âmbito desta tarefa; o runtime não é
  // afetado (supabase-js não valida nomes de tabela/RPC em tempo de execução).
  await supabase
    .from('acordo_parcelas' as any)
    .update({ estado: 'liquidacao_pendente', recibo_id: recibo.id })
    .eq('id', input.parcelaId);

  // Cobrança sem documento fiscal não gera recibo fiscal — liquida na mesma.
  if (!input.numeroFaturaOriginal) {
    await supabase.rpc('acordo_parcela_liquidar' as any, {
      p_parcela_id: input.parcelaId,
      p_invoice_id: null,
    });
    return { estado: 'paga' };
  }

  const payload = {
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
  };

  // ② Enfileirar ANTES de tentar. Se o browser fechar a meio, o worker recupera.
  await supabase.from('faturacao_outbox' as any).insert({
    org_id: input.orgId,
    tipo: 'RC',
    idempotency_key: `RC:parcela:${input.parcelaId}`,
    parcela_id: input.parcelaId,
    payload,
    estado: 'em_curso',
    started_at: new Date().toISOString(),
  });

  try {
    const res = await emitirDocumento(payload);
    // emitirDocumento() só devolve controlo quando o provider confirmou
    // sucesso — QUALQUER falha (known_failed ou unknown) chega ao catch
    // abaixo como excepção, nunca como retorno com success:false. Não existe
    // "else" a tratar aqui.
    //
    // res.invoice pode faltar mesmo com sucesso: é o caso em que o documento
    // foi emitido no provider mas a gravação do espelho local em `invoices`
    // falhou depois (o "warning" da edge function). O documento é real;
    // liquida-se na mesma, só sem o invoice_rc_id para o ligar.
    await supabase.rpc('acordo_parcela_liquidar' as any, {
      p_parcela_id: input.parcelaId,
      p_invoice_id: res.invoice?.id ?? null,
    });
    await supabase
      .from('faturacao_outbox' as any)
      .update({ estado: 'sucesso', invoice_id: res.invoice?.id ?? null })
      .eq('idempotency_key', `RC:parcela:${input.parcelaId}`);
    return { estado: 'paga' };
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
        .eq('idempotency_key', `RC:parcela:${input.parcelaId}`);
    } else {
      await supabase
        .from('faturacao_outbox' as any)
        .update({
          estado: 'suspenso',
          needs_reconcile: true,
          ultimo_erro: (e as Error).message,
        })
        .eq('idempotency_key', `RC:parcela:${input.parcelaId}`);
    }
    return { estado: 'liquidacao_pendente', erro: (e as Error).message };
  }
}
