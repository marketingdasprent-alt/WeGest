import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Authenticate the user via JWT
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token em falta' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sessão inválida' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json();
    const { integracao_id, pagamentos_csv, viagens_csv, org_id: orgId } = body;

    if (!integracao_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'integracao_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!orgId) {
      return new Response(
        JSON.stringify({ success: false, error: 'org_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!pagamentos_csv && !viagens_csv) {
      return new Response(
        JSON.stringify({ success: false, error: 'Pelo menos um ficheiro CSV é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Admin DESTA org (papel per-org em user_organizacoes, não profiles legado).
    const { data: membership } = await supabase
      .from('user_organizacoes')
      .select('is_admin')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!membership?.is_admin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sem permissão de administrador' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // A integração tem de pertencer à org do caller (sem import cross-org).
    const { data: robotConfig } = await supabase
      .from('plataformas_configuracao')
      .select('id, nome')
      .eq('id', integracao_id)
      .eq('plataforma', 'robot')
      .eq('org_id', orgId)
      .single();

    if (!robotConfig) {
      return new Response(
        JSON.stringify({ success: false, error: 'Integração robot não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Forward to uber-import-reports using the robot's own integracao_id
    const forwardBody: Record<string, any> = {
      integracao_id: integracao_id,
      origem: 'Upload Manual (Robot)',
    };
    if (pagamentos_csv) forwardBody.pagamentos_csv = pagamentos_csv;
    if (viagens_csv) forwardBody.viagens_csv = viagens_csv;

    const importResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/uber-import-reports`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(forwardBody),
      },
    );

    const importResult = await importResponse.json();

    // Update robot ultimo_sync
    await supabase
      .from('plataformas_configuracao')
      .update({ ultimo_sync: new Date().toISOString() })
      .eq('id', integracao_id);

    return new Response(
      JSON.stringify({
        success: importResponse.ok,
        message: importResponse.ok ? 'Dados importados com sucesso' : 'Erro ao importar dados',
        import_result: importResult,
      }),
      { status: importResponse.ok ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('robot-manual-import error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
