import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sincronização automática/Apify DESATIVADA — só import manual por CSV.
const SYNC_AUTOMATICO_DESATIVADO = true;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (SYNC_AUTOMATICO_DESATIVADO) {
    return new Response(
      JSON.stringify({ success: false, disabled: true, error: 'Sincronização automática desativada. Use o import manual por CSV.' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const { integracao_id } = await req.json();
    if (!integracao_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'integracao_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: config, error: configError } = await supabase
      .from('plataformas_configuracao')
      .select('*')
      .eq('id', integracao_id)
      .in('plataforma', ['robot', 'repsol', 'edp', 'via_verde'])
      .single();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ success: false, error: 'Integração robot não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let actorId = config.apify_actor_id;
    let apifyToken = config.apify_api_token;

    // Forçar uso do Actor ID e API Token da integração "mestre/original" da MESMA org
    // Isso garante que todas as sub-contas operem sob o mesmo robô e credenciais mais recentes.
    const targetPlatform = config.robot_target_platform || config.plataforma;
    const { data: masterConfig } = await supabase
      .from('plataformas_configuracao')
      .select('apify_actor_id, apify_api_token')
      .eq('plataforma', 'robot')
      .eq('robot_target_platform', targetPlatform)
      .eq('org_id', config.org_id)
      .not('apify_actor_id', 'is', null)
      .not('apify_api_token', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (masterConfig) {
      actorId = masterConfig.apify_actor_id;
      apifyToken = masterConfig.apify_api_token;
    }

    if (!actorId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Actor ID não configurado nesta integração' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!apifyToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'API Token do Apify não configurado nesta integração' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const callbackUrl = `${SUPABASE_URL}/functions/v1/robot-webhook?integracao_id=${integracao_id}`;

    const authMode = config.auth_mode || 'password';

    // Build input based on auth mode
    const actorInput: Record<string, unknown> = {
      startUrl: config.webhook_url || null,
      callbackUrl,
      integracaoId: integracao_id,
    };

    if (authMode === 'cookies') {
      // Parse cookies JSON and send as array
      let parsedCookies = [];
      try {
        parsedCookies = config.cookies_json ? JSON.parse(config.cookies_json) : [];
      } catch {
        return new Response(
          JSON.stringify({ success: false, error: 'Cookies JSON inválido. Verifique o formato.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      actorInput.cookies = parsedCookies;
    } else {
      // Universal fields — send under multiple common field names so any actor variant picks them up
      actorInput.username = config.client_id || null;
      actorInput.email = config.client_id || null;
      actorInput.login = config.client_id || null;
      actorInput.password = config.client_secret || null;
      actorInput.pass = config.client_secret || null;
      actorInput.emailAppPassword = config.client_secret || null;
      actorInput.appPassword = config.client_secret || null;
    }

    // Pass Anti-Captcha key if configured
    if (config.anti_captcha_key) {
      actorInput.antiCaptchaKey = config.anti_captcha_key;
    }

    const apifyResponse = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/runs?token=${apifyToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actorInput),
      },
    );

    const apifyData = await apifyResponse.json();

    if (!apifyResponse.ok) {
      console.error('Apify error:', apifyData);
      return new Response(
        JSON.stringify({ success: false, error: `Apify API error [${apifyResponse.status}]: ${JSON.stringify(apifyData)}` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Update ultimo_sync
    await supabase
      .from('plataformas_configuracao')
      .update({ ultimo_sync: new Date().toISOString() })
      .eq('id', integracao_id);

    return new Response(
      JSON.stringify({
        success: true,
        run_id: apifyData.data?.id || apifyData.id,
        message: 'Robot iniciado com sucesso',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('robot-execute error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
