import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { BrevoProvider } from '../_shared/email/providers/BrevoProvider.ts';
import { contactInquiryTemplate } from '../_shared/email/templates/contactInquiry.ts';
import { validateContactInquiry } from '../_shared/contact-inquiry/validate.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SENDER = { name: 'WeGest — Site', email: 'noreply@dasprent.pt' };

// Formulário "Fale connosco" da landing pública — sem sessão, sem org_id.
// Usa a chave global da Brevo (a mesma que os emails de auth já usam,
// ver EmailProviderFactory.getLegacyFallback) em vez do EmailService
// multi-tenant, que exige sempre uma organização para resolver o provider.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const result = validateContactInquiry(payload);

    if (!result.ok) {
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('BREVO_API_KEY');
    if (!apiKey) {
      throw new Error('BREVO_API_KEY não configurada');
    }

    const destinationEmail = Deno.env.get('CONTACT_INQUIRY_EMAIL') || 'marketing@dasprent.pt';
    const { subject, html } = contactInquiryTemplate(result.data);
    const provider = new BrevoProvider(apiKey, SENDER);

    const sendResult = await provider.send({
      to: [{ email: destinationEmail }],
      subject,
      html,
      senderOverride: { ...SENDER, replyTo: result.data.email },
    });

    if (!sendResult.success) {
      throw new Error(sendResult.error || 'Falha ao enviar email');
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro contact-inquiry:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message || 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
