// supabase/functions/primavera-agent-result/index.ts
//
// Chamada pelo agente local depois de executar um job contra o AS Connect
// (localmente, dentro da rede da empresa). Fecha a linha em primavera_jobs
// com o resultado — é isto que providers/primavera.ts está à espera de ver
// ao fazer poll do estado do job que ele próprio enfileirou.
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

interface Corpo {
  job_id?: string;
  success?: boolean;
  resultado?: unknown;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const chave = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!chave || !chave.startsWith('pva_')) {
      return json({ success: false, error: 'Chave de agente em falta ou inválida.' }, 401);
    }

    const corpo: Corpo = await req.json().catch(() => ({}));
    if (!corpo.job_id || typeof corpo.success !== 'boolean') {
      return json({ success: false, error: 'job_id e success são obrigatórios.' }, 400);
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

    // A org do job tem de bater com a da chave — um agente nunca fecha um job
    // que não seja seu, mesmo que soubesse o id (defesa em profundidade;
    // job_id é um UUID aleatório, praticamente impossível de adivinhar).
    const { data: job, error: erroJob } = await supabase
      .from('primavera_jobs')
      .select('id, org_id, status')
      .eq('id', corpo.job_id)
      .maybeSingle();
    if (erroJob) return json({ success: false, error: erroJob.message }, 500);
    if (!job || job.org_id !== orgId) {
      return json({ success: false, error: 'Job não encontrado para esta organização.' }, 404);
    }

    const { error: erroUpdate } = await supabase
      .from('primavera_jobs')
      .update({
        status: corpo.success ? 'done' : 'failed',
        resultado: corpo.resultado ?? null,
        error_message: corpo.success ? null : (corpo.error ?? 'Erro desconhecido no agente.'),
        completed_at: new Date().toISOString(),
      })
      .eq('id', corpo.job_id);
    if (erroUpdate) return json({ success: false, error: erroUpdate.message }, 500);

    return json({ success: true });
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    console.error('[primavera-agent-result] erro:', msg);
    return json({ success: false, error: msg }, 500);
  }
});
