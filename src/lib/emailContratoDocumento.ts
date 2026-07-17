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
}

export async function enviarContratoDocumentoEmail({
  to,
  toNome,
  subject,
  mensagem,
  pdf,
  filename,
}: EnviarContratoDocumentoArgs): Promise<void> {
  const datauri = pdf.output('datauristring');
  const marcador = 'base64,';
  const idx = datauri.indexOf(marcador);
  const pdfBase64 = idx >= 0 ? datauri.slice(idx + marcador.length) : '';
  if (!pdfBase64) throw new Error('Não foi possível preparar o PDF para envio.');

  const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
    'send-documento-fiscal-email',
    { body: { to, toNome, subject, mensagem, pdfBase64, filename } }
  );

  if (error) throw new Error(error.message || 'Falha ao contactar o serviço de email');
  if (data && data.success === false) throw new Error(data.error || 'Falha ao enviar o documento');
}
