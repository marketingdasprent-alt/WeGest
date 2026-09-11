import { createClient } from 'npm:@supabase/supabase-js@2.105.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WebhookPayload {
  evento: string;
  dados: Record<string, unknown>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { evento, dados } = await req.json() as WebhookPayload;

    if (!evento) {
      return new Response(
        JSON.stringify({ error: 'Evento não especificado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processando evento: ${evento}`);

    // Criar cliente Supabase com service role para bypass RLS
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Buscar webhooks ativos para este evento
    const { data: webhooks, error } = await supabase
      .from('integracoes_webhooks')
      .select('*')
      .eq('evento', evento)
      .eq('ativo', true);

    if (error) {
      console.error('Erro ao buscar webhooks:', error);
      throw error;
    }

    if (!webhooks || webhooks.length === 0) {
      console.log(`Nenhum webhook configurado para o evento: ${evento}`);
      return new Response(
        JSON.stringify({ success: true, message: 'Nenhum webhook configurado', webhooks_triggered: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Encontrados ${webhooks.length} webhook(s) para o evento ${evento}`);

    // Enviar para cada webhook configurado
    const resultados = await Promise.all(
      webhooks.map(async (webhook) => {
        try {
          console.log(`Enviando para webhook: ${webhook.nome} (${webhook.url})`);
          
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };

          // Adicionar headers personalizados se existirem
          if (webhook.headers && typeof webhook.headers === 'object') {
            Object.assign(headers, webhook.headers);
          }

          const response = await fetch(webhook.url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              evento,
              ...dados,
              enviado_em: new Date().toISOString(),
            }),
          });

          const responseText = await response.text();
          console.log(`Resposta de ${webhook.nome}: ${response.status} - ${responseText.substring(0, 200)}`);

          return { 
            webhook: webhook.nome, 
            success: response.ok, 
            status: response.status,
          };
        } catch (err) {
          console.error(`Erro ao enviar para ${webhook.nome}:`, err);
          return { 
            webhook: webhook.nome, 
            success: false, 
            error: err instanceof Error ? err.message : 'Erro desconhecido',
          };
        }
      })
    );

    const successCount = resultados.filter(r => r.success).length;
    console.log(`Webhooks enviados: ${successCount}/${resultados.length}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        webhooks_triggered: webhooks.length,
        resultados,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro na edge function send-webhook:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
