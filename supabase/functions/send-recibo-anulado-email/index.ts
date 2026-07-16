import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { EmailService } from '../_shared/email/services/EmailService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Avisa por email o motorista (e o gestor responsável) de que um recibo foi
 * anulado. Chamada pelo trigger SQL `trg_recibo_anulado_avisos` via pg_net —
 * o corpo traz já os emails e nomes resolvidos (a função não faz DB lookups
 * de negócio, só resolve a integração de email da org via EmailService).
 */
interface ReciboAnuladoRequest {
  orgId: string;
  reciboCodigo: string | number;
  valor?: number | null;
  motivo?: string | null;
  motoristaEmail?: string | null;
  motoristaNome?: string | null;
  gestorEmail?: string | null;
  gestorNome?: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const p: ReciboAnuladoRequest = await req.json();
    if (!p.reciboCodigo || !p.orgId) {
      return new Response(JSON.stringify({ error: 'reciboCodigo e orgId são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const emailService = new EmailService(supabase);

    // Envia a cada destinatário disponível de forma verdadeiramente
    // independente: allSettled garante que uma falha num envio não impede o outro.
    const envios: Array<Promise<{ alvo: string; result: { success: boolean; error?: string } }>> = [];
    if (p.motoristaEmail) {
      envios.push(
        emailService
          .sendReciboAnulado(p.orgId, {
            to: p.motoristaEmail,
            toNome: p.motoristaNome ?? undefined,
            destinatario: 'motorista',
            reciboCodigo: p.reciboCodigo,
            valor: p.valor,
            motivo: p.motivo,
            motoristaNome: p.motoristaNome,
          })
          .then((result) => ({ alvo: 'motorista', result }))
      );
    }
    if (p.gestorEmail) {
      envios.push(
        emailService
          .sendReciboAnulado(p.orgId, {
            to: p.gestorEmail,
            toNome: p.gestorNome ?? undefined,
            destinatario: 'gestor',
            reciboCodigo: p.reciboCodigo,
            valor: p.valor,
            motivo: p.motivo,
            motoristaNome: p.motoristaNome,
            gestorNome: p.gestorNome,
          })
          .then((result) => ({ alvo: 'gestor', result }))
      );
    }

    const settled = await Promise.allSettled(envios);
    const resultados: Record<string, unknown> = {};
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        resultados[s.value.alvo] = s.value.result;
      } else {
        resultados[`envio_${i}`] = { success: false, error: String(s.reason) };
      }
    });

    return new Response(JSON.stringify({ success: true, resultados }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado';
    console.error('send-recibo-anulado-email:', message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
