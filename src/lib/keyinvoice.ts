/**
 * Cliente KeyInvoice (frontend) — API 5.0 REST.
 *
 * A emissão fiscal é feita SERVER-SIDE pela edge function `keyinvoice-emitir`
 * (com a api key como secret do Supabase). O browser NUNCA fala diretamente
 * com o KeyInvoice nem vê a chave — só invoca a edge function.
 */
import { supabase } from '@/integrations/supabase/client';
import type { CreateFaturaPayload, EmitResult, InvoiceMetadata } from '@/types/keyinvoice';

export type { CreateFaturaPayload, EmitResult };

const FN = 'keyinvoice-emitir';

/** Emite um documento (FT / FR / NC) no KeyInvoice. A função grava em `invoices`. */
export async function emitirDocumento(payload: CreateFaturaPayload): Promise<EmitResult> {
  const { data, error } = await supabase.functions.invoke<EmitResult>(FN, {
    body: { action: 'emit', ...payload },
  });
  if (error) throw new Error(error.message || 'Falha a contactar o serviço de faturação');
  if (!data?.success) throw new Error(data?.error || 'Falha ao emitir documento no KeyInvoice');
  return data;
}

/** Health-check: confirma que a edge function autentica no KeyInvoice. */
export async function checkKeyInvoiceHealth(): Promise<boolean> {
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

/** Obtém o PDF (base64) de um documento já emitido. */
export async function fetchDocumentoPdf(invoice: InvoiceMetadata): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{
    success: boolean;
    base64?: string;
    error?: string;
  }>(FN, {
    body: {
      action: 'pdf',
      ki_doctype: invoice.ki_doctype,
      ki_docnum: invoice.ki_docnum,
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
  a.download = `${invoice.tipo}_${invoice.numero ?? invoice.ki_docnum ?? 'documento'}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
