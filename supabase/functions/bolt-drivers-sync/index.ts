import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  type BoltCredenciais,
  type FleetDriver,
  paginar,
} from '../_shared/bolt/client.ts';

/**
 * bolt-drivers-sync — traz a lista de motoristas de cada frota Bolt
 * (getDrivers) e grava-a em bolt_drivers.
 *
 * PARA QUE SERVE
 * Responder, com a fonte certa, a "estes dois driver_uuid são a mesma
 * pessoa?". A auditoria de 2026-08-12/13 encontrou 14 motoristas WeGest com
 * mais do que um uuid na MESMA frota, e não havia como decidir se eram
 * re-registos (saiu e voltou) ou pessoas diferentes fundidas na mesma ficha:
 * as 446 ligações do mapa vinham todas de heurísticas por nome/telefone, e
 * o telefone é pouco fiável (16% diferem do da ficha, e um número chega a
 * estar em 7 fichas).
 *
 * O getDrivers devolve `state` por uuid — active / suspended / deactivated.
 * Com isso a pergunta fecha-se sem adivinhar:
 *   um 'deactivated' + um 'active'  → a mesma pessoa que saiu e voltou;
 *   dois 'active' na mesma frota    → duas pessoas.
 *
 * PORQUE NÃO O bolt-full-sync
 * Esse também chama o getDrivers, mas na mesma passagem escreve em
 * bolt_viagens pelo caminho legado, que preenche driver_earnings. Essa coluna
 * está a NULL de propósito (ver regra 3 do bolt-sync-semana): preenchê-la faz
 * a receita Bolt aparecer a dobrar nos ecrãs financeiros. Esta função não
 * toca em viagens nenhumas.
 *
 * SÓ LEITURA do lado da Bolt. Escreve apenas em bolt_drivers.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (corpo: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json().catch(() => ({}));
    const filtroIntegracao = (body as { integracao_id?: string }).integracao_id ?? null;

    // As mesmas condições do agendador: activa, oauth e mesmo Bolt.
    let query = supabase
      .from('plataformas_configuracao')
      .select('id, nome, org_id, client_id, client_secret, company_id')
      .eq('ativo', true)
      .eq('auth_mode', 'oauth')
      .or('plataforma.eq.bolt,robot_target_platform.eq.bolt');
    if (filtroIntegracao) query = query.eq('id', filtroIntegracao);

    const { data: integracoes, error: erroInt } = await query;
    if (erroInt) return json({ success: false, error: erroInt.message }, 500);

    const resultados: Array<Record<string, unknown>> = [];

    for (const cfg of integracoes ?? []) {
      const clientId = (cfg.client_id ?? '').trim();
      const clientSecret = (cfg.client_secret ?? '').trim();
      const companyId = cfg.company_id;

      if (!clientId || !clientSecret || !companyId) {
        resultados.push({
          integracao: cfg.nome,
          erro: 'sem credenciais ou sem company_id',
        });
        continue;
      }

      const cred: BoltCredenciais = { clientId, clientSecret };

      try {
        const motoristas = await paginar<FleetDriver>(
          cred,
          'getDrivers',
          { company_id: companyId },
          { limite: 500 },
        );

        const linhas = motoristas
          .filter((d) => d?.driver_uuid)
          .map((d) => ({
            driver_uuid: d.driver_uuid,
            name: [d.first_name, d.last_name].filter(Boolean).join(' ').trim() || null,
            email: d.email ?? null,
            phone: d.phone ?? null,
            // `state` é o campo da spec. O bolt-full-sync lia `status`, que não
            // existe — por isso a coluna vinha sempre a null.
            status: d.state ?? null,
            dados_raw: d,
            integracao_id: cfg.id,
            org_id: cfg.org_id,
            updated_at: new Date().toISOString(),
          }));

        let gravados = 0;
        for (let i = 0; i < linhas.length; i += 500) {
          const { error } = await supabase
            .from('bolt_drivers')
            .upsert(linhas.slice(i, i + 500), { onConflict: 'driver_uuid' });
          if (error) throw error;
          gravados += Math.min(500, linhas.length - i);
        }

        const porEstado: Record<string, number> = {};
        for (const l of linhas) porEstado[l.status ?? '(sem estado)'] = (porEstado[l.status ?? '(sem estado)'] ?? 0) + 1;

        resultados.push({
          integracao: cfg.nome,
          company_id: companyId,
          motoristas: linhas.length,
          gravados,
          por_estado: porEstado,
        });
        console.log(`[bolt-drivers-sync] ${cfg.nome}: ${linhas.length} motoristas`);
      } catch (erro) {
        const msg = erro instanceof Error ? erro.message : String(erro);
        resultados.push({ integracao: cfg.nome, erro: msg });
        console.error(`[bolt-drivers-sync] ${cfg.nome} falhou: ${msg}`);
      }
    }

    return json({ success: true, integracoes: resultados });
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    console.error(`[bolt-drivers-sync] erro: ${msg}`);
    return json({ success: false, error: msg }, 500);
  }
});
