import { RequestBodyError } from '../_shared/http/boundedJson.ts';
import { readBoundedObject } from '../_shared/rate-limit/requestBody.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import {
  consumeRateLimit,
  hashRateLimitIdentity,
  rateLimitResponse,
  trustedRequestIp,
} from '../_shared/rate-limit/rateLimit.ts';
import { BrevoProvider } from '../_shared/email/providers/BrevoProvider.ts';
import { contactInquiryTemplate } from '../_shared/email/templates/contactInquiry.ts';
import { validateContactInquiry } from '../_shared/contact-inquiry/validate.ts';
import { captchaResponse, verificarCaptcha } from '../_shared/captcha/turnstile.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SENDER = { name: 'WeGest — Site', email: 'noreply@dasprent.pt' };

// Formulário "Fale connosco" da landing pública — sem sessão, sem org_id.
// Usa a chave global da Brevo (a mesma que os emails de auth já usam,
// ver EmailProviderFactory.getLegacyFallback) em vez do EmailService
// multi-tenant, que exige sempre uma organização para resolver o provider.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { captcha_token, ...payload } = await readBoundedObject(req, 16 * 1024);
    const captcha = await verificarCaptcha(captcha_token, trustedRequestIp(req));
    const recusado = captchaResponse(captcha, corsHeaders);
    if (recusado) return recusado;

    const result = validateContactInquiry(payload);

    if (!result.ok) {
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
    const origem = await hashRateLimitIdentity(trustedRequestIp(req), serviceKey);
    for (const quota of [
      { operation: 'contact-inquiry-origin', identity: origem, limit: 3, windowSeconds: 3600 },
      {
        operation: 'contact-inquiry-global',
        identity: 'contact',
        // Com CAPTCHA os robôs ficam de fora e o tecto global pode subir.
        limit: captcha.ok && captcha.ativo ? 500 : 100,
        windowSeconds: 3600,
      },
    ]) {
      const limitada = rateLimitResponse(await consumeRateLimit(supabase, quota), corsHeaders);
      if (limitada) return limitada;
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
    if (error instanceof RequestBodyError)
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: error.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    console.error('Erro contact-inquiry:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message || 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
