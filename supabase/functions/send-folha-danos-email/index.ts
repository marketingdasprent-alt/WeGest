import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';

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
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
    if (!BREVO_API_KEY) throw new Error('BREVO_API_KEY não configurada');

    const { to, toNome, subject, pdfBase64, filename }: SendFolhaDanosEmailRequest =
      await req.json();

    if (!to || !pdfBase64 || !filename) {
      return new Response(JSON.stringify({ error: 'to, pdfBase64 e filename são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'DÉCADA OUSADA', email: 'noreply@dasprent.pt' },
        to: [{ email: to, name: toNome || undefined }],
        subject,
        htmlContent:
          '<p>Segue em anexo a folha de registo de danos referente ao check-in/check-out da viatura.</p>',
        attachment: [{ content: pdfBase64, name: filename }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Brevo: ${errText}`);
    }

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
