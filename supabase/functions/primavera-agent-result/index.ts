// supabase/functions/primavera-agent-result/index.ts
//
// Chamada pelo agente local depois de executar um job contra o AS Connect
// (localmente, dentro da rede da empresa). Fecha a linha em primavera_jobs
// com o resultado — é isto que providers/primavera.ts está à espera de ver
// ao fazer poll do estado do job que ele próprio enfileirou.
//
// Três desfechos: success (done), falha (failed) e ambiguous (ambiguo): o
// agente enviou o pedido ao Primavera e não sabe se o documento foi criado
// (rede caiu, 5xx, resposta sem forma). Ambíguo nunca volta à fila.
//
// Só fecha jobs ainda 'claimed': um resultado tardio, de um job que a fila
// já deu por ambíguo ou expirado, não reescreve esse estado.
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';

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
  ambiguous?: boolean;
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

    // SEM filtro por `ativo` — ver o mesmo comentário em primavera-agent-poll.
    const { data: configs, error: erroConfig } = await supabase
      .from('plataformas_configuracao')
      .select('id')
      .eq('plataforma', 'faturacao')
      .eq('client_secret', chave)
      .filter('config->>provider', 'eq', 'primavera');

    if (erroConfig) return json({ success: false, error: erroConfig.message }, 500);
    if (!configs || configs.length !== 1) {
      return json({ success: false, error: 'Chave de agente não reconhecida.' }, 401);
    }
    const integracaoId = configs[0].id as string;

    // A integração do job tem de bater com a da chave — um agente nunca fecha
    // um job que não seja seu, mesmo que soubesse o id (defesa em
    // profundidade; job_id é um UUID aleatório, praticamente impossível de
    // adivinhar).
    const { data: job, error: erroJob } = await supabase
      .from('primavera_jobs')
      .select('id, integracao_id, status')
      .eq('id', corpo.job_id)
      .maybeSingle();
    if (erroJob) return json({ success: false, error: erroJob.message }, 500);
    if (!job || job.integracao_id !== integracaoId) {
      return json({ success: false, error: 'Job não encontrado para esta integração.' }, 404);
    }
    if (job.status !== 'claimed') {
      return json(
        { success: false, error: `O job já está "${job.status}"; o resultado tardio foi ignorado.` },
        409
      );
    }

    const status = corpo.ambiguous ? 'ambiguo' : corpo.success ? 'done' : 'failed';
    const { data: fechados, error: erroUpdate } = await supabase
      .from('primavera_jobs')
      .update({
        status,
        resultado: corpo.resultado ?? null,
        error_message: status === 'done' ? null : (corpo.error ?? 'Erro desconhecido no agente.'),
        completed_at: new Date().toISOString(),
      })
      .eq('id', corpo.job_id)
      .eq('status', 'claimed')
      .select('id');
    if (erroUpdate) return json({ success: false, error: erroUpdate.message }, 500);
    if (!fechados || fechados.length === 0) {
      return json({ success: false, error: 'O job deixou de estar reclamado entretanto.' }, 409);
    }

    return json({ success: true });
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    console.error('[primavera-agent-result] erro:', msg);
    return json({ success: false, error: msg }, 500);
  }
});
