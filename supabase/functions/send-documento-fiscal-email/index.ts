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
  /** Nota livre opcional escrita pelo utilizador (quebras de linha preservadas).
   *  O corpo do email é o template — `intro` + `detalhes` abaixo. */
  mensagem?: string;
  intro?: string;
  detalhes?: Array<{ label: string; valor: string }>;
  /** PDF em base64 puro (sem prefixo data:...;base64,). Forma antiga, um só
   *  ficheiro — continua a servir o envio de documentos fiscais. */
  pdfBase64?: string;
  filename?: string;
  /** Vários documentos no mesmo email, cada um como anexo próprio. */
  anexos?: Array<{ content: string; name: string }>;
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
      intro,
      detalhes,
      pdfBase64,
      filename,
      anexos,
      org_id,
      emissorNome,
      emissorLogoUrl,
      titulo,
      categoria,
    }: SendDocumentoFiscalEmailRequest = await req.json();

    // Aceita as duas formas: `anexos` (vários documentos) ou o par
    // pdfBase64+filename da versão anterior (um só).
    const ficheiros = anexos?.length
      ? anexos
      : pdfBase64 && filename
        ? [{ content: pdfBase64, name: filename }]
        : [];

    if (!to || !subject || ficheiros.length === 0 || !org_id) {
      return new Response(
        JSON.stringify({ error: 'to, subject, org_id e pelo menos um anexo são obrigatórios' }),
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
      intro,
      detalhes,
      ficheiros,
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
