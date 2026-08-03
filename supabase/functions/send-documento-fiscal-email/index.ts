import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { EmailService } from '../_shared/email/services/EmailService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendDocumentoFiscalEmailRequest {
  to: string;
  toNome?: string;
  subject: string;
  /** Mensagem em texto simples escrita pelo utilizador (quebras de linha preservadas). */
  mensagem: string;
  /** PDF em base64 puro (sem prefixo data:...;base64,). */
  pdfBase64: string;
  filename: string;
  org_id: string;
  /** Empresa emissora do documento — encabeça o email com a marca dela.
   *  Opcional: sem isto o email sai com a marca WeGest (comportamento antigo). */
  emissorNome?: string;
  emissorLogoUrl?: string | null;
  /** Título e etiqueta do email, ex.: "Contrato de Aluguer" / "Contrato". */
  titulo?: string;
  categoria?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      to,
      toNome,
      subject,
      mensagem,
      pdfBase64,
      filename,
      org_id,
      emissorNome,
      emissorLogoUrl,
      titulo,
      categoria,
    }: SendDocumentoFiscalEmailRequest = await req.json();

    if (!to || !subject || !pdfBase64 || !filename || !org_id) {
      return new Response(
        JSON.stringify({ error: 'to, subject, pdfBase64, filename e org_id são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const emailService = new EmailService(supabase);

    const result = await emailService.sendDocumentoFiscal(org_id, {
      to,
      toNome,
      subject,
      mensagem: mensagem || '',
      pdfBase64,
      filename,
      emissorNome,
      emissorLogoUrl,
      titulo,
      categoria,
    });

    if (!result.success) throw new Error(result.error || 'Falha ao enviar email');

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro send-documento-fiscal-email:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message || 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
