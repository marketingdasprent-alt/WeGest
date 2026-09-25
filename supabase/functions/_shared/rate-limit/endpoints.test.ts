import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const realFetch = globalThis.fetch;
const realServe = Deno.serve;
const servers: Deno.HttpServer[] = [];
const effects: string[] = [];
const quotas = new Map<string, number>();
const rpcCalls: Record<string, unknown>[] = [];
let failure = false;
let reject = false;
let whitelist: string[] = [];
let primaveraLimit = 2;

function reply(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function databaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.pathname.endsWith('/rpc/consume_edge_rate_limit')) {
    const payload: Record<string, unknown> = await request.json();
    rpcCalls.push(payload);
    if (failure) return reply({ message: 'storage offline' }, 503);
    const key = `${payload.p_operation}:${payload.p_subject_hash}`;
    const used = quotas.get(key) ?? 0;
    const allowed = !reject && used < Number(payload.p_limit);
    if (allowed) quotas.set(key, used + 1);
    return reply({ allowed, retry_after: allowed ? 0 : 60 });
  }
  if (url.pathname.endsWith('/primavera_api_keys') && request.method === 'GET') {
    return reply({
      id: 'key-a',
      org_id: 'org-a',
      ativo: true,
      expires_at: null,
      ip_whitelist: whitelist,
      permissoes: ['clientes:read', 'clientes:write'],
      rate_limit_per_minute: primaveraLimit,
    });
  }
  if (url.pathname.endsWith('/auth/v1/user')) return reply({ id: 'user-a', aud: 'authenticated' });
  if (url.pathname.endsWith('/ti_tokens')) return reply({ org_id: 'org-a' });
  effects.push(`${request.method} ${url.pathname}`);
  if (url.pathname.endsWith('/ti_tickets')) return reply({ id: 'ticket-a', numero: 1 });
  if (url.hostname === 'api.brevo.com') return reply({ messageId: 'mail-a' });
  return reply([]);
}

async function startEndpoint(name: string, instance = 'a'): Promise<string> {
  Object.defineProperty(Deno, 'serve', {
    configurable: true,
    value: (handler: Deno.ServeHandler) => {
      const server = realServe({ hostname: '127.0.0.1', port: 0, onListen() {} }, handler);
      servers.push(server);
      return server;
    },
  });
  await import(new URL(`../../${name}/index.ts?instance=${instance}`, import.meta.url).href);
  const server = servers.at(-1);
  if (!server || server.addr.transport !== 'tcp') throw new Error('Endpoint não arrancou');
  return `http://127.0.0.1:${server.addr.port}/${name}`;
}

function reset() {
  effects.length = 0;
  rpcCalls.length = 0;
  quotas.clear();
  failure = false;
  reject = false;
  whitelist = [];
  primaveraLimit = 2;
}

const contact = {
  nome: 'Maria',
  email: 'maria@example.test',
  mensagem: 'Gostaria de conhecer o serviço.',
  website: '',
};
const ticket = {
  token: 'public-link',
  nome: 'Maria',
  email: 'maria@example.test',
  descricao: 'Problema no acesso',
  anexos: [],
};

Deno.test(
  'handlers HTTP reservam quota antes de efeitos e partilham quota entre instâncias',
  async (t) => {
    Deno.env.set('SUPABASE_URL', 'https://database.example.test');
    Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
    Deno.env.set('BREVO_API_KEY', 'test-brevo-key');
    globalThis.fetch = databaseFetch;
    try {
      const registerA = await startEndpoint('register-org');
      const registerB = await startEndpoint('register-org', 'b');
      const contactUrl = await startEndpoint('contact-inquiry');
      const ticketUrl = await startEndpoint('ti-ticket-submeter');
      const primaveraUrl = await startEndpoint('primavera-api');
      const post = (url: string, body: unknown) =>
        realFetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.1' },
          body: JSON.stringify(body),
        });

      await t.step('sexto registo noutra instância é bloqueado', async () => {
        reset();
        for (let attempt = 0; attempt < 5; attempt++) {
          const response = await post(registerA, {});
          assertEquals(response.status, 400);
          await response.text();
        }
        const response = await post(registerB, {});
        assertEquals(response.status, 429);
        assertEquals(response.headers.get('Retry-After'), '60');
        await response.text();
        assertEquals(effects, []);
      });

      for (const [name, url, body] of [
        ['contacto', contactUrl, contact],
        ['ticket', ticketUrl, ticket],
        ['registo', registerA, {}],
      ] as const) {
        await t.step(`${name}: 429 e falha 503 não produzem efeitos`, async () => {
          for (const status of [429, 503]) {
            reset();
            reject = status === 429;
            failure = status === 503;
            const response = await post(url, body);
            assertEquals(response.status, status);
            await response.text();
            assertEquals(effects, []);
          }
        });
      }

      await t.step(
        'Primavera aplica quota configurada antes de queries e estatísticas',
        async () => {
          reset();
          const request = () =>
            realFetch(`${primaveraUrl}/clientes`, { headers: { 'x-api-key': 'wg_test' } });
          for (let attempt = 0; attempt < 2; attempt++) {
            const response = await request();
            assertEquals(response.status, 200);
            await response.text();
          }
          effects.length = 0;
          const response = await request();
          assertEquals(response.status, 429);
          assertEquals(response.headers.get('Retry-After'), '60');
          await response.text();
          assertEquals(effects, []);
          assertEquals(rpcCalls[0]?.p_limit, 2);
          assertEquals(rpcCalls[0]?.p_window_seconds, 60);
          failure = true;
          const unavailable = await request();
          assertEquals(unavailable.status, 503);
          await unavailable.text();
          assertEquals(effects, []);
        }
      );

      // Fora de 1..10000 a RPC recusa os parâmetros (22023) e a chave ficava em
      // 503 permanente; a coluna não tem CHECK e um admin da org pode gravá-la.
      await t.step('Primavera prende a quota configurada entre 1 e 10000', async () => {
        for (const [configurada, aplicada] of [
          [0, 1],
          [-5, 1],
          [50000, 10000],
        ] as const) {
          reset();
          primaveraLimit = configurada;
          const response = await realFetch(`${primaveraUrl}/clientes`, {
            headers: { 'x-api-key': 'wg_test' },
          });
          await response.text();
          assertEquals(rpcCalls[0]?.p_limit, aplicada);
        }
      });

      await t.step('Primavera não aceita whitelist falsificada no início de XFF', async () => {
        reset();
        whitelist = ['192.0.2.1'];
        const response = await realFetch(`${primaveraUrl}/clientes`, {
          headers: {
            'x-api-key': 'wg_test',
            'x-forwarded-for': '192.0.2.1, 203.0.113.1',
          },
        });
        assertEquals(response.status, 403);
        await response.text();
        assertEquals(rpcCalls.length, 0);
        assertEquals(effects, []);
      });

      await t.step('tickets simultaneos reservam apenas cinco lugares', async () => {
        reset();
        const responses = await Promise.all(
          Array.from({ length: 10 }, () => post(ticketUrl, ticket))
        );
        assertEquals(responses.filter((response) => response.status === 200).length, 5);
        assertEquals(responses.filter((response) => response.status === 429).length, 5);
        await Promise.all(responses.map((response) => response.text()));
        assertEquals(effects.filter((effect) => effect === 'POST /rest/v1/ti_tickets').length, 5);
      });

      await t.step('utilizador autenticado nao renova quota ao mudar de origem', async () => {
        reset();
        for (let attempt = 0; attempt < 6; attempt++) {
          effects.length = 0;
          const response = await realFetch(ticketUrl, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: 'Bearer user-session',
              'cf-connecting-ip': '203.0.113.' + (attempt + 1),
            },
            body: JSON.stringify({ ...ticket, org_id: 'attacker-org' }),
          });
          assertEquals(response.status, attempt < 5 ? 200 : 429);
          await response.text();
          if (attempt === 5) assertEquals(effects, []);
        }
        assertEquals(rpcCalls.filter((call) => call.p_operation === 'ti-ticket-user').length, 6);
        // A quota agregada da org vem por último: quem é barrado pela sua quota
        // individual não gasta os 100/h que a org inteira partilha.
        assertEquals(rpcCalls.filter((call) => call.p_operation === 'ti-ticket-org').length, 5);
      });

      await t.step('corpos demasiado grandes falham antes da escrita de negocio', async () => {
        for (const url of [registerA, contactUrl]) {
          reset();
          const response = await post(url, { payload: 'a'.repeat(16 * 1024) });
          assertEquals(response.status, 413);
          await response.text();
          assertEquals(effects, []);
        }
        reset();
        const response = await realFetch(primaveraUrl + '/clientes', {
          method: 'POST',
          headers: {
            'x-api-key': 'wg_test',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ payload: 'a'.repeat(64 * 1024) }),
        });
        assertEquals(response.status, 413);
        await response.text();
        assertEquals(
          effects.some((effect) => effect === 'POST /rest/v1/motoristas_ativos'),
          false
        );
      });

      await t.step(
        'contacto e ticket legítimos continuam a enviar/criar após reserva',
        async () => {
          for (const [url, body] of [
            [contactUrl, contact],
            [ticketUrl, ticket],
          ] as const) {
            reset();
            const response = await post(url, body);
            assertEquals(response.status, 200);
            await response.text();
            assertEquals(rpcCalls.length, 2);
            assertEquals(effects.length > 0, true);
          }
        }
      );
    } finally {
      globalThis.fetch = realFetch;
      Object.defineProperty(Deno, 'serve', { configurable: true, value: realServe });
      await Promise.all(servers.map((server) => server.shutdown()));
    }
  }
);
