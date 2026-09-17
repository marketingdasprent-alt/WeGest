import { createClient } from 'npm:@supabase/supabase-js@2.105.4'
import {
  authenticateUser,
  AuthorizationError,
  isInternalRequest,
  requireOrgMember,
} from '../_shared/auth/edgeAuthorization.ts';

// Dispara webhooks de um evento de negócio. Exige membro da org (sessão) ou
// service role (interno) + org_id — antes era anónimo e disparava tudo
// (auditoria 2026-09-16).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WebhookPayload {
  evento: string;
  dados: Record<string, unknown>;
  org_id?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const { evento, dados, org_id } = await req.json() as WebhookPayload;

    if (!evento) {
      return json({ error: 'Evento não especificado' }, 400);
    }

    // Criar cliente Supabase com service role para bypass RLS
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let orgId: string | null = null;

    if (isInternalRequest(req, serviceRoleKey)) {
      if (!org_id || !UUID_RE.test(org_id)) {
        return json({ error: 'org_id é obrigatório numa chamada interna' }, 400);
      }
      orgId = org_id;
    } else {
      const authClient = createClient(supabaseUrl, anonKey);
      const user = await authenticateUser(req, {
        getUser: async (token) => {
          const { data, error } = await authClient.auth.getUser(token);
          return { user: error || !data.user ? null : { id: data.user.id } };
        },
      });

      if (org_id && UUID_RE.test(org_id)) {
        orgId = org_id;
      } else {
        const { data: activeOrg } = await supabase
          .from('user_org_ativa')
          .select('org_id')
          .eq('user_id', user.id)
          .maybeSingle();
        orgId = activeOrg?.org_id ?? null;
      }
      if (!orgId) throw new AuthorizationError('Sem organização ativa', 403);

      await requireOrgMember(user.id, orgId, async (userId, org) => {
        const { data, error } = await supabase
          .from('user_organizacoes')
          .select('is_admin')
          .eq('user_id', userId)
          .eq('org_id', org)
          .maybeSingle();
        return error ? null : data;
      });
    }

    console.log(`Processando evento: ${evento} (org ${orgId})`);

    // Buscar webhooks ativos DESTA org para este evento
    const { data: webhooks, error } = await supabase
      .from('integracoes_webhooks')
      .select('*')
      .eq('org_id', orgId)
      .eq('evento', evento)
      .eq('ativo', true);

    if (error) {
      console.error('Erro ao buscar webhooks:', error);
      throw error;
    }

    if (!webhooks || webhooks.length === 0) {
      console.log(`Nenhum webhook configurado para o evento: ${evento}`);
      return json({ success: true, message: 'Nenhum webhook configurado', webhooks_triggered: 0 });
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
              ...(dados ?? {}),
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

    return json({
      success: true,
      webhooks_triggered: webhooks.length,
      resultados,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return json({ error: error.message }, error.status);
    }
    console.error('Erro na edge function send-webhook:', error);
    return json({ error: error instanceof Error ? error.message : 'Erro interno' }, 500);
  }
});
