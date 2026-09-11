import { createClient } from 'npm:@supabase/supabase-js@2.105.4';

import {
  authenticateUser,
  AuthorizationError,
  requireOrgAdmin,
} from '../_shared/auth/edgeAuthorization.ts';
import {
  buildBoltApiResponse,
  parseBoltApiRequest,
  type BoltApiParams,
  type BoltOperation,
} from '../_shared/bolt/apiRequest.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BOLT_API_BASE = 'https://node.bolt.eu/fleet-integration-gateway';

const endpoints: Record<BoltOperation, string> = {
  getDrivers: '/fleetIntegration/v1/getDrivers',
  getVehicles: '/fleetIntegration/v1/getVehicles',
  getCompanies: '/fleetIntegration/v1/getCompanies',
  getFleetStateLogs: '/fleetIntegration/v1/getFleetStateLogs',
  getFleetOrders: '/fleetIntegration/v1/getFleetOrders',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamError';
  }
}

function buildRequestBody(
  operation: BoltOperation,
  companyId: number,
  params: BoltApiParams,
): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  if (operation === 'getCompanies') return { ...params };

  const paginated = {
    start_ts: params.start_ts ?? now - 7 * 24 * 3600,
    end_ts: params.end_ts ?? now,
    limit: params.limit ?? (operation === 'getFleetOrders' ? 500 : 100),
    offset: params.offset ?? 0,
  };
  return operation === 'getFleetOrders'
    ? { company_ids: [companyId], ...paginated }
    : { company_id: companyId, ...paginated };
}

async function fetchBoltToken(clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch('https://oidc.bolt.eu/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'fleet-integration:api',
    }),
  });
  if (!response.ok) {
    console.error('bolt-api: OIDC recusou credenciais', { status: response.status });
    throw new UpstreamError('Falha na autenticação com a Bolt');
  }

  const data = (await response.json()) as { access_token?: unknown };
  if (typeof data.access_token !== 'string' || !data.access_token) {
    throw new UpstreamError('Resposta de autenticação Bolt inválida');
  }
  return data.access_token;
}

async function callBoltApi(
  operation: BoltOperation,
  token: string,
  companyId: number,
  params: BoltApiParams,
): Promise<unknown> {
  const response = await fetch(`${BOLT_API_BASE}${endpoints[operation]}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildRequestBody(operation, companyId, params)),
  });
  const responseText = await response.text();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    console.error('bolt-api: resposta não JSON', { operation, status: response.status });
    throw new UpstreamError('Resposta inválida da Bolt');
  }

  if (!response.ok || (typeof parsed.code === 'number' && parsed.code !== 0)) {
    console.error('bolt-api: operação recusada', {
      operation,
      status: response.status,
      code: typeof parsed.code === 'number' ? parsed.code : null,
    });
    throw new UpstreamError('A Bolt recusou a operação pedida');
  }
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'Método não permitido' }, 405);

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
    const request = parseBoltApiRequest(await req.json());

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: config, error: configError } = await admin
      .from('plataformas_configuracao')
      .select(
        'id, org_id, client_id, client_secret, company_id, ativo, plataforma, robot_target_platform, auth_mode',
      )
      .eq('id', request.integracao_id)
      .maybeSingle();
    const isBolt =
      config?.plataforma === 'bolt' ||
      (config?.robot_target_platform === 'bolt' && config?.auth_mode === 'oauth');
    if (configError || !config || !config.ativo || !isBolt || !config.org_id) {
      return json({ success: false, error: 'Integração Bolt não encontrada ou inativa' }, 404);
    }

    await requireOrgAdmin(user.id, config.org_id, async (userId, orgId) => {
      const { data, error } = await admin
        .from('user_organizacoes')
        .select('is_admin')
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .maybeSingle();
      return error ? null : data;
    });
    if (!config.client_id || !config.client_secret || config.company_id === null) {
      return json({ success: false, error: 'Credenciais Bolt incompletas' }, 400);
    }

    const token = await fetchBoltToken(config.client_id, config.client_secret);
    const upstream = await callBoltApi(
      request.operation,
      token,
      Number(config.company_id),
      request.params,
    );
    const result = buildBoltApiResponse(request.operation, upstream);
    console.log('bolt-api: operação concluída', {
      operation: request.operation,
      integracao_id: config.id,
      total: result.total,
    });

    return json({
      success: true,
      operation: request.operation,
      company_id: Number(config.company_id),
      ...result,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return json({ success: false, error: error.message }, error.status);
    }
    const message = error instanceof Error ? error.message : 'Erro interno';
    if (error instanceof UpstreamError) return json({ success: false, error: message }, 502);
    const status = /obrigatório|inválid|Operação/i.test(message) ? 400 : 500;
    console.error('bolt-api:', message);
    return json({ success: false, error: message }, status);
  }
});
