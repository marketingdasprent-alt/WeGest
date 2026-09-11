import { createClient } from 'npm:@supabase/supabase-js@2.105.4';

type UntypedSupabaseClient = ReturnType<typeof createClient<any>>;

// ─── CORS ────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApiKeyRecord {
  id: string;
  org_id: string;
  nome: string;
  permissoes: string[];
  ativo: boolean;
  ip_whitelist: string[];
  rate_limit_per_minute: number;
  expires_at: string | null;
}

interface ApiContext {
  keyId: string;
  orgId: string;
  permissions: string[];
}

interface ApiResponse {
  success: boolean;
  data?: unknown;
  pagination?: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
  error?: { code: string; message: string };
  timestamp: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(body: ApiResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function success(data: unknown, pagination?: ApiResponse['pagination']): Response {
  return json({ success: true, data, pagination, timestamp: new Date().toISOString() });
}

function error(code: string, message: string, status = 400): Response {
  return json(
    { success: false, error: { code, message }, timestamp: new Date().toISOString() },
    status
  );
}

function getPagination(url: URL): { page: number; perPage: number; from: number; to: number } {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') || '50')));
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  return { page, perPage, from, to };
}

// ─── Authentication ──────────────────────────────────────────────────────────

async function authenticate(
  req: Request,
  supabase: UntypedSupabaseClient
): Promise<ApiContext | Response> {
  // Extract API key from headers
  const apiKey =
    req.headers.get('x-api-key') ||
    req.headers.get('authorization')?.replace(/^(Bearer|ApiKey)\s+/i, '') ||
    null;

  if (!apiKey || !apiKey.startsWith('wg_')) {
    return error('UNAUTHORIZED', 'API key em falta ou inválida. Use o header X-API-Key.', 401);
  }

  // Lookup key
  const { data: key, error: dbErr } = await supabase
    .from('primavera_api_keys')
    .select('id, org_id, nome, permissoes, ativo, ip_whitelist, rate_limit_per_minute, expires_at')
    .eq('api_key', apiKey)
    .single();

  if (dbErr || !key) {
    return error('UNAUTHORIZED', 'API key não encontrada.', 401);
  }

  const k = key as ApiKeyRecord;

  if (!k.ativo) {
    return error('FORBIDDEN', 'API key desativada.', 403);
  }

  if (k.expires_at && new Date(k.expires_at) < new Date()) {
    return error('FORBIDDEN', 'API key expirada.', 403);
  }

  // IP whitelist check
  if (k.ip_whitelist && k.ip_whitelist.length > 0) {
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    if (!k.ip_whitelist.includes(clientIp)) {
      return error('FORBIDDEN', `IP ${clientIp} não autorizado.`, 403);
    }
  }

  // Update usage stats (fire & forget)
  supabase
    .from('primavera_api_keys')
    .update({
      last_used_at: new Date().toISOString(),
      total_requests: (key as any).total_requests + 1,
    })
    .eq('id', k.id)
    .then(() => {});

  return { keyId: k.id, orgId: k.org_id, permissions: k.permissoes };
}

function hasPermission(ctx: ApiContext, resource: string, action: 'read' | 'write'): boolean {
  return ctx.permissions.includes(`${resource}:${action}`);
}

// ─── Route: /health ──────────────────────────────────────────────────────────

function handleHealth(): Response {
  return success({
    status: 'ok',
    service: 'WeGest Primavera API',
    version: '1.0.0',
  });
}

// ─── Route: /clientes ────────────────────────────────────────────────────────

async function handleClientes(
  req: Request,
  ctx: ApiContext,
  supabase: UntypedSupabaseClient,
  pathParts: string[],
  url: URL
): Promise<Response> {
  const method = req.method;
  const id = pathParts[1]; // /clientes/:id
  const subRoute = pathParts[1]; // /clientes/nif/:nif

  // GET /clientes
  if (method === 'GET' && !id) {
    if (!hasPermission(ctx, 'clientes', 'read'))
      return error('FORBIDDEN', 'Sem permissão para ler clientes.', 403);

    const { page, perPage, from, to } = getPagination(url);
    const updatedSince = url.searchParams.get('updated_since');

    let query = supabase
      .from('motoristas_ativos')
      .select(
        'id, nome, nif, email, telefone, morada, documento_tipo, documento_numero, documento_validade, carta_conducao, carta_validade, data_contratacao, status_ativo, created_at, updated_at',
        { count: 'exact' }
      )
      .eq('org_id', ctx.orgId)
      .order('nome');

    if (updatedSince) query = query.gte('updated_at', updatedSince);
    query = query.range(from, to);

    const { data, error: qErr, count } = await query;
    if (qErr) return error('DB_ERROR', qErr.message, 500);

    return success(data, {
      page,
      per_page: perPage,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / perPage),
    });
  }

  // GET /clientes/nif/:nif
  if (method === 'GET' && subRoute === 'nif' && pathParts[2]) {
    if (!hasPermission(ctx, 'clientes', 'read'))
      return error('FORBIDDEN', 'Sem permissão para ler clientes.', 403);

    const { data, error: qErr } = await supabase
      .from('motoristas_ativos')
      .select(
        'id, nome, nif, email, telefone, morada, documento_tipo, documento_numero, documento_validade, carta_conducao, carta_validade, data_contratacao, status_ativo, created_at, updated_at'
      )
      .eq('org_id', ctx.orgId)
      .eq('nif', pathParts[2])
      .single();

    if (qErr) return error('NOT_FOUND', 'Cliente não encontrado com esse NIF.', 404);
    return success(data);
  }

  // GET /clientes/:id
  if (method === 'GET' && id) {
    if (!hasPermission(ctx, 'clientes', 'read'))
      return error('FORBIDDEN', 'Sem permissão para ler clientes.', 403);

    const { data, error: qErr } = await supabase
      .from('motoristas_ativos')
      .select(
        'id, nome, nif, email, telefone, morada, documento_tipo, documento_numero, documento_validade, carta_conducao, carta_validade, data_contratacao, status_ativo, created_at, updated_at'
      )
      .eq('org_id', ctx.orgId)
      .eq('id', id)
      .single();

    if (qErr) return error('NOT_FOUND', 'Cliente não encontrado.', 404);
    return success(data);
  }

  // POST /clientes
  if (method === 'POST' && !id) {
    if (!hasPermission(ctx, 'clientes', 'write'))
      return error('FORBIDDEN', 'Sem permissão para criar clientes.', 403);

    const body = await req.json();
    const { data, error: qErr } = await supabase
      .from('motoristas_ativos')
      .insert({ ...body, org_id: ctx.orgId })
      .select()
      .single();

    if (qErr) return error('DB_ERROR', qErr.message, 500);
    return json({ success: true, data, timestamp: new Date().toISOString() }, 201);
  }

  // PUT /clientes/:id
  if (method === 'PUT' && id) {
    if (!hasPermission(ctx, 'clientes', 'write'))
      return error('FORBIDDEN', 'Sem permissão para atualizar clientes.', 403);

    const body = await req.json();
    delete body.id;
    delete body.org_id;

    const { data, error: qErr } = await supabase
      .from('motoristas_ativos')
      .update(body)
      .eq('id', id)
      .eq('org_id', ctx.orgId)
      .select()
      .single();

    if (qErr) return error('DB_ERROR', qErr.message, 500);
    return success(data);
  }

  return error('METHOD_NOT_ALLOWED', `Método ${method} não suportado em /clientes.`, 405);
}

// ─── Route: /contratos ───────────────────────────────────────────────────────

async function handleContratos(
  req: Request,
  ctx: ApiContext,
  supabase: UntypedSupabaseClient,
  pathParts: string[],
  url: URL
): Promise<Response> {
  const method = req.method;
  const id = pathParts[1];

  if (method !== 'GET')
    return error('METHOD_NOT_ALLOWED', 'Contratos apenas suporta leitura.', 405);

  if (!hasPermission(ctx, 'contratos', 'read'))
    return error('FORBIDDEN', 'Sem permissão para ler contratos.', 403);

  // GET /contratos/:id
  if (id) {
    const { data, error: qErr } = await supabase
      .from('contratos')
      .select('*')
      .eq('org_id', ctx.orgId)
      .eq('id', id)
      .single();

    if (qErr) return error('NOT_FOUND', 'Contrato não encontrado.', 404);
    return success(data);
  }

  // GET /contratos
  const { page, perPage, from, to } = getPagination(url);
  const motoristaId = url.searchParams.get('motorista_id');
  const status = url.searchParams.get('status');

  let query = supabase
    .from('contratos')
    .select('*', { count: 'exact' })
    .eq('org_id', ctx.orgId)
    .order('criado_em', { ascending: false });

  if (motoristaId) query = query.eq('motorista_id', motoristaId);
  if (status) query = query.eq('status', status);
  query = query.range(from, to);

  const { data, error: qErr, count } = await query;
  if (qErr) return error('DB_ERROR', qErr.message, 500);

  return success(data, {
    page,
    per_page: perPage,
    total: count || 0,
    total_pages: Math.ceil((count || 0) / perPage),
  });
}

// ─── Route: /faturas ─────────────────────────────────────────────────────────

async function handleFaturas(
  req: Request,
  ctx: ApiContext,
  supabase: UntypedSupabaseClient,
  pathParts: string[],
  url: URL
): Promise<Response> {
  const method = req.method;
  const id = pathParts[1];

  if (!hasPermission(ctx, 'faturas', method === 'GET' ? 'read' : 'write'))
    return error('FORBIDDEN', 'Sem permissão para aceder faturas.', 403);

  // GET /faturas/:id
  if (method === 'GET' && id) {
    const { data, error: qErr } = await supabase
      .from('recibos_importados')
      .select('*')
      .eq('org_id', ctx.orgId)
      .eq('id', id)
      .single();

    if (qErr) return error('NOT_FOUND', 'Fatura não encontrada.', 404);
    return success(data);
  }

  // GET /faturas
  if (method === 'GET') {
    const { page, perPage, from, to } = getPagination(url);
    const motoristaId = url.searchParams.get('motorista_id');
    const updatedSince = url.searchParams.get('updated_since');

    let query = supabase
      .from('recibos_importados')
      .select('*', { count: 'exact' })
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false });

    if (motoristaId) query = query.eq('motorista_id', motoristaId);
    if (updatedSince) query = query.gte('updated_at', updatedSince);
    query = query.range(from, to);

    const { data, error: qErr, count } = await query;
    if (qErr) return error('DB_ERROR', qErr.message, 500);

    return success(data, {
      page,
      per_page: perPage,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / perPage),
    });
  }

  // POST /faturas
  if (method === 'POST' && !id) {
    const body = await req.json();
    const { data, error: qErr } = await supabase
      .from('recibos_importados')
      .insert({ ...body, org_id: ctx.orgId })
      .select()
      .single();

    if (qErr) return error('DB_ERROR', qErr.message, 500);
    return json({ success: true, data, timestamp: new Date().toISOString() }, 201);
  }

  // PUT /faturas/:id
  if (method === 'PUT' && id) {
    const body = await req.json();
    delete body.id;
    delete body.org_id;

    const { data, error: qErr } = await supabase
      .from('recibos_importados')
      .update(body)
      .eq('id', id)
      .eq('org_id', ctx.orgId)
      .select()
      .single();

    if (qErr) return error('DB_ERROR', qErr.message, 500);
    return success(data);
  }

  return error('METHOD_NOT_ALLOWED', `Método ${method} não suportado em /faturas.`, 405);
}

// ─── Route: /recibos ─────────────────────────────────────────────────────────

async function handleRecibos(
  req: Request,
  ctx: ApiContext,
  supabase: UntypedSupabaseClient,
  pathParts: string[],
  url: URL
): Promise<Response> {
  const method = req.method;
  const id = pathParts[1];

  if (!hasPermission(ctx, 'recibos', method === 'GET' ? 'read' : 'write'))
    return error('FORBIDDEN', 'Sem permissão para aceder recibos.', 403);

  // GET /recibos/:id
  if (method === 'GET' && id) {
    const { data, error: qErr } = await supabase
      .from('motorista_recibos')
      .select('*')
      .eq('org_id', ctx.orgId)
      .eq('id', id)
      .single();

    if (qErr) return error('NOT_FOUND', 'Recibo não encontrado.', 404);
    return success(data);
  }

  // GET /recibos
  if (method === 'GET') {
    const { page, perPage, from, to } = getPagination(url);
    const motoristaId = url.searchParams.get('motorista_id');

    let query = supabase
      .from('motorista_recibos')
      .select('*', { count: 'exact' })
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false });

    if (motoristaId) query = query.eq('motorista_id', motoristaId);
    query = query.range(from, to);

    const { data, error: qErr, count } = await query;
    if (qErr) return error('DB_ERROR', qErr.message, 500);

    return success(data, {
      page,
      per_page: perPage,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / perPage),
    });
  }

  // POST /recibos
  if (method === 'POST' && !id) {
    const body = await req.json();
    const { data, error: qErr } = await supabase
      .from('motorista_recibos')
      .insert({ ...body, org_id: ctx.orgId })
      .select()
      .single();

    if (qErr) return error('DB_ERROR', qErr.message, 500);
    return json({ success: true, data, timestamp: new Date().toISOString() }, 201);
  }

  // PUT /recibos/:id
  if (method === 'PUT' && id) {
    const body = await req.json();
    delete body.id;
    delete body.org_id;

    const { data, error: qErr } = await supabase
      .from('motorista_recibos')
      .update(body)
      .eq('id', id)
      .eq('org_id', ctx.orgId)
      .select()
      .single();

    if (qErr) return error('DB_ERROR', qErr.message, 500);
    return success(data);
  }

  return error('METHOD_NOT_ALLOWED', `Método ${method} não suportado em /recibos.`, 405);
}

// ─── Route: /contas-correntes ────────────────────────────────────────────────

async function handleContasCorrentes(
  req: Request,
  ctx: ApiContext,
  supabase: UntypedSupabaseClient,
  pathParts: string[],
  url: URL
): Promise<Response> {
  const method = req.method;
  const subRoute = pathParts[1];
  const id = pathParts[1];

  if (!hasPermission(ctx, 'contas_correntes', method === 'GET' ? 'read' : 'write'))
    return error('FORBIDDEN', 'Sem permissão para aceder contas correntes.', 403);

  // GET /contas-correntes/motorista/:motorista_id
  if (method === 'GET' && subRoute === 'motorista' && pathParts[2]) {
    const { page, perPage, from, to } = getPagination(url);

    const {
      data,
      error: qErr,
      count,
    } = await supabase
      .from('motorista_financeiro')
      .select('*', { count: 'exact' })
      .eq('org_id', ctx.orgId)
      .eq('motorista_id', pathParts[2])
      .order('data_movimento', { ascending: false })
      .range(from, to);

    if (qErr) return error('DB_ERROR', qErr.message, 500);

    return success(data, {
      page,
      per_page: perPage,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / perPage),
    });
  }

  // GET /contas-correntes/:id
  if (method === 'GET' && id) {
    const { data, error: qErr } = await supabase
      .from('motorista_financeiro')
      .select('*')
      .eq('org_id', ctx.orgId)
      .eq('id', id)
      .single();

    if (qErr) return error('NOT_FOUND', 'Movimento não encontrado.', 404);
    return success(data);
  }

  // GET /contas-correntes
  if (method === 'GET') {
    const { page, perPage, from, to } = getPagination(url);
    const motoristaId = url.searchParams.get('motorista_id');
    const tipo = url.searchParams.get('tipo');
    const status = url.searchParams.get('status');

    let query = supabase
      .from('motorista_financeiro')
      .select('*', { count: 'exact' })
      .eq('org_id', ctx.orgId)
      .order('data_movimento', { ascending: false });

    if (motoristaId) query = query.eq('motorista_id', motoristaId);
    if (tipo) query = query.eq('tipo', tipo);
    if (status) query = query.eq('status', status);
    query = query.range(from, to);

    const { data, error: qErr, count } = await query;
    if (qErr) return error('DB_ERROR', qErr.message, 500);

    return success(data, {
      page,
      per_page: perPage,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / perPage),
    });
  }

  // POST /contas-correntes
  if (method === 'POST' && !subRoute) {
    const body = await req.json();
    const { data, error: qErr } = await supabase
      .from('motorista_financeiro')
      .insert({ ...body, org_id: ctx.orgId })
      .select()
      .single();

    if (qErr) return error('DB_ERROR', qErr.message, 500);
    return json({ success: true, data, timestamp: new Date().toISOString() }, 201);
  }

  // PUT /contas-correntes/:id
  if (method === 'PUT' && id) {
    const body = await req.json();
    delete body.id;
    delete body.org_id;

    const { data, error: qErr } = await supabase
      .from('motorista_financeiro')
      .update(body)
      .eq('id', id)
      .eq('org_id', ctx.orgId)
      .select()
      .single();

    if (qErr) return error('DB_ERROR', qErr.message, 500);
    return success(data);
  }

  return error('METHOD_NOT_ALLOWED', `Método ${method} não suportado em /contas-correntes.`, 405);
}

// ─── Request Logger ──────────────────────────────────────────────────────────

async function logRequest(
  supabase: UntypedSupabaseClient,
  ctx: ApiContext | null,
  req: Request,
  endpoint: string,
  statusCode: number,
  startTime: number,
  errorMsg?: string
) {
  if (!ctx) return;

  let requestBody = null;
  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      requestBody = await req.clone().json();
    } catch {
      // body already consumed or not JSON
    }
  }

  await supabase.from('primavera_api_logs').insert({
    api_key_id: ctx.keyId,
    org_id: ctx.orgId,
    endpoint: `${req.method} ${endpoint}`,
    method: req.method,
    status_code: statusCode,
    request_body: requestBody,
    ip_address:
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown',
    duration_ms: Date.now() - startTime,
    error_message: errorMsg || null,
  });
}

// ─── Main Router ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  const url = new URL(req.url);

  // Parse path: remove /primavera-api prefix if present
  const fullPath = url.pathname;
  const pathMatch = fullPath.match(/\/primavera-api\/(.*)/);
  const path = pathMatch ? `/${pathMatch[1]}` : fullPath;
  const pathParts = path.split('/').filter(Boolean);
  const resource = pathParts[0] || '';

  // Health check — no auth required
  if (resource === 'health') {
    return handleHealth();
  }

  // Create Supabase admin client (service role — bypasses RLS)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Authenticate
  const authResult = await authenticate(req, supabase);
  if (authResult instanceof Response) {
    await logRequest(supabase, null, req, `/${resource}`, 401, startTime, 'Auth failed');
    return authResult;
  }

  const ctx = authResult;
  let response: Response;

  try {
    switch (resource) {
      case 'clientes':
        response = await handleClientes(req, ctx, supabase, pathParts, url);
        break;
      case 'contratos':
        response = await handleContratos(req, ctx, supabase, pathParts, url);
        break;
      case 'faturas':
        response = await handleFaturas(req, ctx, supabase, pathParts, url);
        break;
      case 'recibos':
        response = await handleRecibos(req, ctx, supabase, pathParts, url);
        break;
      case 'contas-correntes':
        response = await handleContasCorrentes(req, ctx, supabase, pathParts, url);
        break;
      default:
        response = error(
          'NOT_FOUND',
          `Endpoint /${resource} não existe. Endpoints disponíveis: /clientes, /contratos, /faturas, /recibos, /contas-correntes, /health`,
          404
        );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno';
    response = error('INTERNAL_ERROR', msg, 500);
  }

  // Log request (fire & forget)
  logRequest(supabase, ctx, req, `/${resource}`, response.status, startTime).catch(() => {});

  return response;
});
