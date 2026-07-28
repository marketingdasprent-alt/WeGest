/**
 * Envio de um documento fiscal já emitido por email (PDF em anexo).
 *
 * Combina dois blocos existentes: obtém o PDF em base64 on-demand a partir do
 * provider de faturação (`fetchDocumentoPdf`) e delega o envio à edge function
 * `send-documento-fiscal-email` (Brevo, remetente noreply@dasprent.pt).
 */
import { supabase } from '@/integrations/supabase/client';
import type { InvoiceMetadata } from '@/types/faturacao';
import { fetchDocumentoPdf } from './faturacao';
import { nomeFicheiroDocumento } from './documentoEmail';

export interface EnviarDocumentoFiscalArgs {
  to: string;
  toNome?: string;
  subject: string;
  mensagem: string;
  invoice: InvoiceMetadata;
}

export async function enviarDocumentoFiscalEmail({
  to,
  toNome,
  subject,
  mensagem,
  invoice,
}: EnviarDocumentoFiscalArgs): Promise<void> {
  const pdfBase64 = await fetchDocumentoPdf(invoice);
  const filename = nomeFicheiroDocumento(invoice);

  const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
    'send-documento-fiscal-email',
    { body: { to, toNome, subject, mensagem, pdfBase64, filename, org_id: invoice.org_id } }
  );

  if (error) {
    // FunctionsHttpError não expõe o corpo JSON em error.message (fica só a
    // string genérica "Edge Function returned a non-2xx status code") — a
    // razão real vem em error.context (a Response).
    let mensagem = error.message || 'Falha ao contactar o serviço de email';
    try {
      const body = await error.context?.json?.();
      mensagem = body?.error || mensagem;
    } catch {
      // corpo não é JSON válido — mantém a mensagem genérica
    }
    throw new Error(mensagem);
  }
  if (data && data.success === false) throw new Error(data.error || 'Falha ao enviar o documento');
}
