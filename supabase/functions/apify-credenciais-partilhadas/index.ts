import { createClient } from 'npm:@supabase/supabase-js@2.105.4';

import {
  authenticateUser,
  AuthorizationError,
  requireOrgAdmin,
} from '../_shared/auth/edgeAuthorization.ts';
import {
  buildPublicApifyStatus,
  ROBOT_TARGET_PLATFORMS,
  type RobotTargetPlatform,
} from '../_shared/integracoes/robotIntegration.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authClient = createClient(supabaseUrl, anonKey);
    const user = await authenticateUser(req, {
      getUser: async (token) => {
        const { data, error } = await authClient.auth.getUser(token);
        return { user: error || !data.user ? null : { id: data.user.id } };
      },
    });

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: activeOrg } = await admin
      .from('user_org_ativa')
      .select('org_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!activeOrg?.org_id) throw new AuthorizationError('Sem organização ativa', 403);

    await requireOrgAdmin(user.id, activeOrg.org_id, async (userId, orgId) => {
      const { data, error } = await admin
        .from('user_organizacoes')
        .select('is_admin')
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .maybeSingle();
      return error ? null : data;
    });

    const body = await req.json();
    const platform = body?.robot_target_platform as RobotTargetPlatform;
    if (!ROBOT_TARGET_PLATFORMS.includes(platform)) {
      return json({ error: 'Plataforma inválida' }, 400);
    }

    const { data, error } = await admin
      .from('apify_credenciais_partilhadas')
      .select('apify_actor_id, apify_api_token')
      .eq('robot_target_platform', platform)
      .maybeSingle();
    if (error) throw new Error(error.message);

    return json(buildPublicApifyStatus(data));
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return json({ error: error.message }, error.status);
    }
    const message = error instanceof Error ? error.message : 'Erro interno';
    console.error('apify-credenciais-partilhadas:', message);
    return json({ error: message }, 500);
  }
});
