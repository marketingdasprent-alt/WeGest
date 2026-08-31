import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// A conta Apify é do WeGest, não de cada organização — o token e o actor_id
// de cada plataforma (uber/bolt/repsol/edp/viaverde/bp) são os mesmos para
// todas as empresas. Esta função devolve essa credencial partilhada, lida
// com service-role de apify_credenciais_partilhadas (sem RLS acessível ao
// browser), para que criar a primeira integração de uma plataforma numa org
// nova não dependa de já existir outra integração dessa plataforma na mesma
// org (ver IntegracaoDialog.tsx).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const { robot_target_platform } = await req.json();
    if (!robot_target_platform) {
      return new Response(JSON.stringify({ error: 'robot_target_platform é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data, error } = await supabase
      .from('apify_credenciais_partilhadas')
      .select('apify_actor_id, apify_api_token')
      .eq('robot_target_platform', robot_target_platform)
      .single();

    if (error || !data) {
      return new Response(
        JSON.stringify({
          error: `Sem credenciais Apify partilhadas para "${robot_target_platform}"`,
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('apify-credenciais-partilhadas error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
