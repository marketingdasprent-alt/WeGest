import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { type BoltCredenciais, type FleetDriver, paginar } from '../_shared/bolt/client.ts';

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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json().catch(() => ({}));
    const filtroIntegracao = (body as { integracao_id?: string }).integracao_id ?? null;

    const desde = (body as { desde?: string }).desde ?? '2026-03-01';
    const DIAS_JANELA = 30;
    const janelas: Array<{ inicio: number; fim: number }> = [];
    {
      const fimGlobal = Date.now();
      let cursor = new Date(`${desde}T00:00:00Z`).getTime();
      while (cursor < fimGlobal) {
        const fim = Math.min(cursor + DIAS_JANELA * 86400_000, fimGlobal);
        janelas.push({
          inicio: Math.floor(cursor / 1000),
          fim: Math.floor(fim / 1000),
        });
        cursor = fim;
      }
    }

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
        const porUuid = new Map<string, FleetDriver>();
        for (const janela of janelas) {
          const lote = await paginar<FleetDriver>(
            cred,
            'getDrivers',
            { company_id: companyId, start_ts: janela.inicio, end_ts: janela.fim },
            { limite: 500 }
          );
          for (const d of lote) {
            if (d?.driver_uuid) porUuid.set(d.driver_uuid, d);
          }
        }
        const motoristas = [...porUuid.values()];

        const linhas = motoristas
          .filter((d) => d?.driver_uuid)
          .map((d) => ({
            driver_uuid: d.driver_uuid,
            name: [d.first_name, d.last_name].filter(Boolean).join(' ').trim() || null,
            email: d.email ?? null,
            phone: d.phone ?? null,
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
        for (const l of linhas)
          porEstado[l.status ?? '(sem estado)'] = (porEstado[l.status ?? '(sem estado)'] ?? 0) + 1;

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
