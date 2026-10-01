// Só enfileira integrações OAuth; o worker executa o sync com concorrência limitada.
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import {
  analisarData,
  segundaDaSemana,
  semanaEntre,
  semanaPassada,
  somarDias,
} from '../_shared/bolt/semana.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

interface Pedido {
  integracao_id?: string;
  periodo_inicio?: string;
  periodo_fim?: string;
  formula_id?: string;
  origem?: 'cron' | 'manual';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // A service-role ignora RLS; pedidos manuais exigem admin em cada organização.
    const authHeader = req.headers.get('Authorization') ?? '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '');
    const ehCron = bearer === SERVICE_ROLE_KEY;

    let callerUserId: string | null = null;
    if (!ehCron) {
      if (!bearer) return json({ success: false, error: 'Não autenticado.' }, 401);
      const anon = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
        error: erroAuth,
      } = await anon.auth.getUser();
      if (erroAuth || !user) {
        // Distingue cron com chave anon de uma sessão de utilizador inválida.
        const ehChaveAnon = bearer === ANON_KEY;
        return json(
          {
            success: false,
            error: ehChaveAnon
              ? 'Chamada sem utilizador: o cron invocou com a chave anon em vez da service-role. ' +
                'Falta o segredo cron_service_role_jwt no Vault.'
              : 'Sessão inválida.',
          },
          401
        );
      }
      callerUserId = user.id;
    }

    const corpo: Pedido = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    // Datas inválidas são rejeitadas para não enfileirar outra semana.
    let semana;
    if (corpo.periodo_inicio) {
      const inicio = analisarData(corpo.periodo_inicio);
      if (!inicio) {
        return json(
          { success: false, error: `periodo_inicio inválido: ${corpo.periodo_inicio}` },
          400
        );
      }
      const fim = corpo.periodo_fim ? analisarData(corpo.periodo_fim) : null;
      if (corpo.periodo_fim && !fim) {
        return json({ success: false, error: `periodo_fim inválido: ${corpo.periodo_fim}` }, 400);
      }
      if (fim) {
        semana = semanaEntre(inicio, fim);
      } else {
        // Uma data isolada representa a semana completa que a contém.
        const segunda = segundaDaSemana(inicio);
        semana = semanaEntre(segunda, somarDias(segunda, 6));
      }
    } else {
      semana = semanaPassada();
    }

    const periodoInicio = semana.inicio;
    const periodoFim = semana.fim;

    // Inclui integrações convertidas que preservam `plataforma='robot'` por histórico.
    let query = supabase
      .from('plataformas_configuracao')
      .select('id, nome, org_id, plataforma, robot_target_platform, auth_mode, ativo, company_id')
      .eq('ativo', true)
      .eq('auth_mode', 'oauth')
      .or('plataforma.eq.bolt,robot_target_platform.eq.bolt');

    if (corpo.integracao_id) query = query.eq('id', corpo.integracao_id);

    const { data: integracoes, error: erroLer } = await query;
    if (erroLer)
      return json({ success: false, error: `Falha a ler integrações: ${erroLer.message}` }, 500);

    const candidatas = integracoes ?? [];

    if (callerUserId) {
      const orgs = [...new Set(candidatas.map((i) => i.org_id))];
      for (const orgId of orgs) {
        const { data: membership } = await supabase
          .from('user_organizacoes')
          .select('is_admin')
          .eq('user_id', callerUserId)
          .eq('org_id', orgId)
          .maybeSingle();
        if (!membership?.is_admin) {
          return json(
            { success: false, error: 'Sem permissão de administrador nesta organização.' },
            403
          );
        }
      }
    }

    if (candidatas.length === 0) {
      const motivo = corpo.integracao_id
        ? 'A integração indicada não está activa em modo API (auth_mode=oauth).'
        : 'Nenhuma integração Bolt está convertida para a API oficial. Converta pelo menos uma antes de agendar.';
      return json({ success: true, enfileiradas: 0, ja_em_fila: 0, message: motivo });
    }

    let enfileiradas = 0;
    let jaEmFila = 0;
    const erros: string[] = [];

    for (const integracao of candidatas) {
      const { error } = await supabase.from('bolt_sync_queue').insert({
        integracao_id: integracao.id,
        org_id: integracao.org_id,
        periodo_inicio: periodoInicio,
        periodo_fim: periodoFim,
        formula_id: corpo.formula_id ?? null,
        origem: ehCron ? 'cron' : (corpo.origem ?? 'manual'),
      });

      // O índice único trata pedidos repetidos como deduplicação, não erro.
      if (error && (error as { code?: string }).code === '23505') {
        jaEmFila++;
        continue;
      }
      if (error) {
        erros.push(`${integracao.nome}: ${error.message}`);
        continue;
      }
      enfileiradas++;
    }

    console.log(
      `[bolt-sync-agendado] semana ${periodoInicio}..${periodoFim} · ` +
        `enfileiradas ${enfileiradas} · já em fila ${jaEmFila} · erros ${erros.length}`
    );

    return json({
      success: erros.length === 0,
      periodo_inicio: periodoInicio,
      periodo_fim: periodoFim,
      integracoes: candidatas.length,
      enfileiradas,
      ja_em_fila: jaEmFila,
      erros,
      message:
        enfileiradas > 0
          ? `${enfileiradas} ${enfileiradas === 1 ? 'conta enfileirada' : 'contas enfileiradas'} para ${periodoInicio} a ${periodoFim}. O processamento arranca dentro de 5 minutos.`
          : jaEmFila > 0
            ? `Já estava em fila (${jaEmFila}). Nada a fazer.`
            : 'Nada enfileirado.',
    });
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    console.error('[bolt-sync-agendado] erro:', msg);
    return json({ success: false, error: msg }, 500);
  }
});
