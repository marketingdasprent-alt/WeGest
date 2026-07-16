import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { EmailService } from '../_shared/email/services/EmailService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendFolhaDanosEmailRequest {
  to: string;
  toNome?: string;
  subject: string;
  /** PDF em base64 puro (sem prefixo data:...;base64,). */
  pdfBase64: string;
  filename: string;
  /** Ausente no fluxo por token (sem sessão) — derivado de viaturaId nesse caso. */
  org_id?: string;
  /** Viatura do check-in/check-out — usada para derivar org_id quando org_id é omitido. */
  viaturaId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, toNome, subject, pdfBase64, filename, org_id, viaturaId }: SendFolhaDanosEmailRequest =
      await req.json();

    if (!to || !pdfBase64 || !filename || (!org_id && !viaturaId)) {
      return new Response(
        JSON.stringify({ error: 'to, pdfBase64, filename e (org_id ou viaturaId) são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const emailService = new EmailService(supabase);

    const result = await emailService.sendFolhaDanos(org_id ?? null, {
      to,
      toNome,
      subject,
      pdfBase64,
      filename,
      viaturaId,
    });

    if (!result.success) throw new Error(result.error || 'Falha ao enviar email');

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro send-folha-danos-email:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message || 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
