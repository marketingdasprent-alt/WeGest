// supabase/functions/primavera-agent-poll/index.ts
//
// Chamada pelo agente local (fora desta base de dados, dentro da rede da
// empresa) de poucos em poucos segundos: "há trabalho para mim?". Autentica
// pela chave do agente (gerada na UI, guardada em
// plataformas_configuracao.client_secret) — nunca por sessão de utilizador,
// o agente não tem uma.
//
// Devolve só o payload de NEGÓCIO de cada job (tipo, cliente, itens) — nunca
// nenhuma credencial do AS Connect, que o agente já tem na sua própria
// configuração local.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Poucos de cada vez: o agente processa um a um contra o AS Connect (que não
// tem paralelismo documentado) e volta a chamar em segundos.
const MAX_POR_POLL = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const chave = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!chave || !chave.startsWith('pva_')) {
      return json({ success: false, error: 'Chave de agente em falta ou inválida.' }, 401);
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Sem .single(): uma chave "duplicada" nunca deveria acontecer (é
    // aleatória, 32 bytes), mas tratar isso como "não encontrada" em vez de
    // deixar rebentar é mais seguro do que assumir unicidade sem a garantir
    // por constraint — o mesmo bug já mordeu a integração Bolt.
    const { data: configs, error: erroConfig } = await supabase
      .from('plataformas_configuracao')
      .select('org_id')
      .eq('plataforma', 'faturacao')
      .eq('ativo', true)
      .eq('client_secret', chave)
      .filter('config->>provider', 'eq', 'primavera');

    if (erroConfig) return json({ success: false, error: erroConfig.message }, 500);
    if (!configs || configs.length !== 1) {
      return json({ success: false, error: 'Chave de agente não reconhecida.' }, 401);
    }
    const orgId = configs[0].org_id as string;

    const { data: jobs, error: erroClaim } = await supabase.rpc('primavera_jobs_claim', {
      p_org_id: orgId,
      p_max: MAX_POR_POLL,
    });
    if (erroClaim) return json({ success: false, error: erroClaim.message }, 500);

    // "Visto pela última vez": reaproveita ultimo_sync, já mostrado noutras
    // integrações — não vale a pena uma coluna nova só para isto.
    supabase
      .from('plataformas_configuracao')
      .update({ ultimo_sync: new Date().toISOString() })
      .eq('org_id', orgId)
      .eq('plataforma', 'faturacao')
      .filter('config->>provider', 'eq', 'primavera')
      .then(() => {});

    const lista = (jobs ?? []) as Array<{ id: string; tipo: string; payload: unknown }>;
    return json({
      success: true,
      jobs: lista.map((j) => ({ id: j.id, tipo: j.tipo, payload: j.payload })),
    });
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    console.error('[primavera-agent-poll] erro:', msg);
    return json({ success: false, error: msg }, 500);
  }
});
