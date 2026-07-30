/**
 * Cliente de faturação fiscal (frontend) — provider-agnostic.
 *
 * A emissão fiscal é feita SERVER-SIDE pela edge function `faturacao-emitir`,
 * que despacha para o software de faturação configurado por organização (a
 * chave vive na config da org, nunca no browser). O browser só invoca a função.
 */
import { supabase } from '@/integrations/supabase/client';
import type {
  ClienteFatura,
  CreateFaturaPayload,
  EmitResult,
  InvoiceMetadata,
} from '@/types/faturacao';

export type { CreateFaturaPayload, EmitResult };

/** Subconjunto de `clientes` necessário para o cabeçalho de um documento fiscal. */
export interface ClienteRowParaFatura {
  nome?: string | null;
  nif?: string | null;
  email?: string | null;
  morada?: string | null;
  codigo_postal?: string | null;
  localidade?: string | null;
}

/**
 * Mapeia um registo de `clientes` para o cliente do documento fiscal.
 * NOTA: usa `localidade` (campo fiscal), não `cidade`.
 */
export function clienteRowToFatura(
  row: ClienteRowParaFatura | null | undefined,
  fallbackNome?: string
): ClienteFatura {
  return {
    nome: row?.nome || fallbackNome || 'Cliente',
    nif: row?.nif || undefined,
    email: row?.email || undefined,
    morada: row?.morada || undefined,
    codigo_postal: row?.codigo_postal || undefined,
    localidade: row?.localidade || undefined,
    country_code: 'PT',
  };
}

const FN = 'faturacao-emitir';

/** Emite um documento (FT / FR / NC / RC) no provider configurado. A função grava em `invoices`. */
export async function emitirDocumento(payload: CreateFaturaPayload): Promise<EmitResult> {
  const { data, error } = await supabase.functions.invoke<EmitResult>(FN, {
    body: { action: 'emit', ...payload },
  });
  if (error) throw new Error(error.message || 'Falha a contactar o serviço de faturação');
  if (!data?.success) {
    const err = new Error(data?.error || 'Falha ao emitir documento fiscal');
    // `classe` (known_failed | unknown) vem da edge function e distingue se é
    // seguro reagendar automaticamente. Anexada ao erro — não ao tipo de
    // retorno, que só existe no caminho de sucesso — para chamadores que
    // precisem dela (acordoPagamento.ts). Propriedade extra e inerte para
    // todos os chamadores existentes, que só leem `.message`.
    (err as Error & { classe?: string }).classe = data?.classe;
    throw err;
  }
  return data;
}

/** Health-check: confirma que a edge function autentica no provider configurado. */
export async function checkFaturacaoHealth(): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean }>(FN, {
      body: { action: 'health' },
    });
    if (error) return false;
    return !!data?.ok;
  } catch {
    return false;
  }
}

/**
 * Anula a faturação de um conjunto de cobranças (estorna tudo → saldo a zero):
 * anula os recibos e notas de crédito ativos ligados e as próprias cobranças, e
 * fecha (cancela) qualquer acordo de pagamento/parcelamento ativo dessas
 * cobranças. Os triggers de conta-corrente lançam os estornos (recibo/NC →
 * débito; cobrança → crédito), que se cancelam entre si. NÃO emite Nota de
 * Crédito nem cancela o documento fiscal no provider — isso, se necessário, é
 * uma ação separada/manual. Lança em erro.
 */
export async function anularCobrancasFaturacao(cobrancaIds: string[]): Promise<void> {
  for (const id of cobrancaIds) {
    // Recibos ativos da cobrança → anulados (estorno a débito). Uma cobrança
    // pode ter VÁRIOS recibos ativos ao mesmo tempo (acordo de parcelamento:
    // um por parcela) — este UPDATE já os apanha todos, por `referencia`.
    // Grava um motivo automático — se o recibo pertencer a um motorista, o
    // aviso de anulação sai coerente e tranquilizador (em vez de vazio ou
    // alarmante: "faturação anulada" faria o motorista pensar que perdeu o
    // contrato, quando é apenas um reprocessamento administrativo).
    const { data: recibosAnulados, error: recErr } = await supabase
      .from('recibos')
      .update({
        estado: 'anulado',
        observacoes: 'Recibo anulado por reprocessamento da faturação — será emitido novo recibo.',
      })
      .eq('referencia', id)
      .eq('estado', 'ativo')
      .select('id');
    if (recErr) throw recErr;

    // Cada recibo anulado acima pode pertencer a uma parcela de um acordo de
    // pagamento — sem isto, a parcela ficava presa em 'liquidacao_pendente'/
    // 'paga' com recibo_id a apontar para um recibo já anulado, e o outbox
    // continuava a tentar reemitir (mesmo bug já corrigido para a anulação
    // avulsa em FaturacaoTab.confirmarAnular — aqui faltava). No-op para
    // recibos que não pertencem a nenhuma parcela.
    for (const r of recibosAnulados ?? []) {
      const { error: reverterErr } = await supabase.rpc(
        'acordo_parcela_reverter_pagamento' as any,
        { p_recibo_id: (r as { id: string }).id }
      );
      if (reverterErr) {
        console.warn('Falha (não crítica) a reverter parcela do acordo:', reverterErr);
      }
    }

    // Notas de crédito ativas da cobrança → anuladas (estorno a débito).
    // A tabela pode não existir em BDs antigas — não partir por isso.
    try {
      const { error: ncErr } = await supabase
        .from('notas_credito')
        .update({ estado: 'anulado' })
        .eq('cobranca_id', id)
        .eq('estado', 'ativo');
      // 42P01 = "undefined_table" — BD antiga sem esta tabela, ignorar.
      if (ncErr && (ncErr as any).code !== '42P01') throw ncErr;
    } catch (e: any) {
      if (e?.code !== '42P01') throw e;
      console.warn('notas_credito indisponível ao anular (BD antiga)');
    }

    // Cobrança → anulada (trigger lança o estorno a crédito).
    const { error: cobErr } = await supabase
      .from('contrato_cobrancas')
      .update({ estado: 'anulada' })
      .eq('id', id)
      .in('estado', ['emitida', 'paga']);
    if (cobErr) throw cobErr;

    // Se esta cobrança tinha um acordo de pagamento (parcelamento) ativo,
    // fecha-o também — sem isto o acordo ficava "ativo" para sempre, a
    // apontar para uma cobrança já anulada, e continuava a mostrar "falta
    // pagar" o valor nominal inteiro (achado ao verificar manualmente,
    // 30/07/2026: 2 acordos órfãos reais na BD). Ao contrário de
    // acordo_cancelar (só para um acordo "limpo"), esta função fecha
    // incondicionalmente — a fatura já foi anulada, não há nada a proteger.
    // No-op silencioso se não houver acordo ativo para esta cobrança.
    const { error: acordoErr } = await supabase.rpc('acordo_cancelar_por_fatura_anulada' as any, {
      p_cobranca_id: id,
    });
    if (acordoErr) {
      console.warn('Falha (não crítica) a cancelar o acordo de pagamento:', acordoErr);
    }
  }
}

/** Obtém o PDF (base64) de um documento já emitido. */
export async function fetchDocumentoPdf(invoice: InvoiceMetadata): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{
    success: boolean;
    base64?: string;
    error?: string;
  }>(FN, {
    body: {
      action: 'pdf',
      provider_doctype: invoice.provider_doctype,
      provider_docnum: invoice.provider_docnum,
      serie: invoice.serie ?? undefined,
    },
  });
  if (error) throw new Error(error.message || 'Falha a obter o PDF');
  if (!data?.success || !data.base64) throw new Error(data?.error || 'PDF indisponível');
  return data.base64;
}

/** Faz download do PDF de um documento (converte o base64 e dispara o download). */
export async function baixarDocumentoPdf(invoice: InvoiceMetadata): Promise<void> {
  const base64 = await fetchDocumentoPdf(invoice);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${invoice.tipo}_${invoice.numero ?? invoice.provider_docnum ?? 'documento'}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Abre o PDF de um documento numa nova aba (pré-visualização).
 *
 * `win` deve ser uma janela aberta de forma SÍNCRONA no gesto do clique
 * (window.open após `await` é bloqueado pelos browsers). Se `win` for null
 * (pop-up bloqueado), faz fallback para download.
 */
export async function abrirDocumentoPdf(
  invoice: InvoiceMetadata,
  win: Window | null
): Promise<void> {
  let base64: string;
  try {
    base64 = await fetchDocumentoPdf(invoice);
  } catch (e) {
    win?.close();
    throw e;
  }
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  if (win) {
    win.location.href = url;
  } else {
    // pop-up bloqueado → fallback para download
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoice.tipo}_${invoice.numero ?? invoice.provider_docnum ?? 'documento'}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
