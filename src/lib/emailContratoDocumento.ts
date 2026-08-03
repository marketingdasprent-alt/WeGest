/**
 * Envio do PDF de um contrato (aluguer/prestação) por email — reutiliza a
 * mesma edge function genérica já usada para documentos fiscais
 * (`send-documento-fiscal-email`: recebe pdfBase64 + destino, não depende de
 * nada específico de faturação), evitando duplicar infraestrutura de envio.
 */
import type jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';

export interface EnviarContratoDocumentoArgs {
  to: string;
  toNome?: string;
  subject: string;
  mensagem: string;
  pdf: jsPDF;
  filename: string;
  orgId: string;
  /** Empresa emissora do contrato — o email sai com a marca dela (logótipo e
   *  nome no cabeçalho), em vez da marca WeGest. */
  emissorNome?: string;
  emissorLogoUrl?: string | null;
  titulo?: string;
  categoria?: string;
}

export async function enviarContratoDocumentoEmail({
  to,
  toNome,
  subject,
  mensagem,
  pdf,
  filename,
  orgId,
  emissorNome,
  emissorLogoUrl,
  titulo,
  categoria,
}: EnviarContratoDocumentoArgs): Promise<void> {
  const datauri = pdf.output('datauristring');
  const marcador = 'base64,';
  const idx = datauri.indexOf(marcador);
  const pdfBase64 = idx >= 0 ? datauri.slice(idx + marcador.length) : '';
  if (!pdfBase64) throw new Error('Não foi possível preparar o PDF para envio.');

  const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
    'send-documento-fiscal-email',
    {
      body: {
        to,
        toNome,
        subject,
        mensagem,
        pdfBase64,
        filename,
        org_id: orgId,
        emissorNome,
        emissorLogoUrl,
        titulo,
        categoria,
      },
    }
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
