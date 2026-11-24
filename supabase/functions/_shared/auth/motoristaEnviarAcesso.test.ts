import { assertEquals, assertFalse, assertStringIncludes } from 'jsr:@std/assert@1.0.19';
import { stub } from 'jsr:@std/testing@1.0.16/mock';
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { CARGO_MOTORISTA_ID } from './cargoMotorista.ts';
import { handleEnviarAcesso } from '../../motorista-enviar-acesso/handler.ts';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OUTRA_ORG = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const FICHA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CONTA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOVA = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const STAFF = 'staff-1';
const SENHA = 'Zq7Kp3Wm9Xv2';

interface Opcoes {
  authValid?: boolean;
  orgAtiva?: string;
  admin?: boolean;
  recursos?: string[];
  ficha?: Record<string, unknown> | null;
  contaEmail?: string;
  ultimoLogin?: string | null;
  tipo?: string;
  membrosAdmin?: boolean;
  membroCargo?: string | null;
  registarFalha?: boolean;
  iguais?: unknown[];
  existente?: unknown[];
  criarExiste?: boolean;
  fichaDepois?: string | null;
  ligarFalha?: boolean;
  limitada?: string;
  emailOk?: boolean;
}
interface Call {
  path: string;
  method: string;
  body: Record<string, unknown>;
}

function fixture(o: Opcoes = {}) {
  const calls: Call[] = [];
  const fichaBase = {
    id: FICHA,
    nome: 'Maria Silva',
    email: 'ficha@x.test',
    user_id: null,
    org_id: ORG,
  };
  let leituraFicha = 0;
  const client = createClient('https://synthetic.test', 'synthetic-service-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        );
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        const method = init?.method ?? 'GET';
        calls.push({ path: url.pathname + url.search, method, body });
        let data: unknown = null;
        let status = 200;
        const p = url.pathname;
        if (p === '/auth/v1/user') {
          data =
            o.authValid === false
              ? { message: 'Invalid JWT' }
              : { id: STAFF, email: 'staff@a.test' };
          if (o.authValid === false) status = 401;
        } else if (p === '/rest/v1/user_org_ativa') {
          data = { org_id: o.orgAtiva ?? ORG };
        } else if (p === '/rest/v1/user_organizacoes') {
          data =
            url.searchParams.get('user_id') === `eq.${STAFF}`
              ? { is_admin: o.admin ?? false, cargo_id: 'cargo-1' }
              : [
                  {
                    is_admin: o.membrosAdmin ?? false,
                    cargo_id: o.membroCargo === undefined ? CARGO_MOTORISTA_ID : o.membroCargo,
                  },
                ];
        } else if (p === '/rest/v1/rpc/cargo_ids_do_utilizador') {
          data = ['cargo-1'];
        } else if (p === '/rest/v1/cargo_permissoes') {
          data = (o.recursos ?? ['motoristas_acesso_app']).map((nome) => ({ recursos: { nome } }));
        } else if (p === '/rest/v1/motoristas_ativos') {
          if (method === 'PATCH') {
            data = o.ligarFalha ? null : { id: FICHA };
          } else if (url.searchParams.get('id')?.startsWith('neq.')) {
            data = o.iguais ?? [];
          } else {
            leituraFicha++;
            data =
              leituraFicha === 1
                ? o.ficha === undefined
                  ? fichaBase
                  : o.ficha
                : { user_id: o.fichaDepois === undefined ? NOVA : o.fichaDepois };
          }
        } else if (p === '/rest/v1/profiles') {
          data = url.searchParams.get('id')
            ? { tipo_utilizador: o.tipo ?? 'motorista' }
            : (o.existente ?? []);
        } else if (p === '/rest/v1/organizacoes') {
          data = { codigo: 'sul' };
        } else if (p === `/auth/v1/admin/users/${CONTA}` || p === `/auth/v1/admin/users/${NOVA}`) {
          data = {
            id: CONTA,
            email: o.contaEmail ?? 'conta@auth.test',
            last_sign_in_at: o.ultimoLogin === undefined ? null : o.ultimoLogin,
          };
        } else if (p === '/auth/v1/admin/users' && method === 'POST') {
          data = o.criarExiste
            ? {
                code: 422,
                error_code: 'email_exists',
                msg: 'A user with this email address has already been registered',
              }
            : { id: NOVA, email: body.email };
          if (o.criarExiste) status = 422;
        } else if (p === '/rest/v1/rpc/consume_edge_rate_limit') {
          data =
            body.p_operation === o.limitada
              ? { allowed: false, retry_after: 600 }
              : { allowed: true, retry_after: 0 };
        } else if (p === '/rest/v1/rpc/registar_acesso_provisorio') {
          data = o.registarFalha ? { message: 'boom' } : 'acesso-1';
          if (o.registarFalha) status = 500;
        }
        return new Response(JSON.stringify(data), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  });
  const enviados: Record<string, unknown>[] = [];
  const deps = {
    gerarSenha: () => SENHA,
    agora: () => new Date('2026-11-25T12:00:00Z'),
    appUrl: 'https://sul.wegest.pt',
    enviarEmail: (_org: string, args: Record<string, unknown>) => {
      enviados.push(args);
      return Promise.resolve(
        o.emailOk === false ? { success: false, error: 'brevo' } : { success: true }
      );
    },
  };
  const req = (
    body: Record<string, unknown> = { motorista_id: FICHA, org_id: ORG },
    token = 'test-token'
  ) =>
    new Request('https://synthetic.test', {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  const efeitos = () =>
    calls.filter(
      (c) =>
        (c.path.startsWith('/auth/v1/admin/') && c.method !== 'GET') ||
        c.path.includes('registar_acesso_provisorio') ||
        (c.path.includes('motoristas_ativos') && c.method === 'PATCH')
    );
  return { calls, client, deps, enviados, req, efeitos };
}

const fichaComConta = {
  id: FICHA,
  nome: 'Maria Silva',
  email: 'ficha@x.test',
  user_id: CONTA,
  org_id: ORG,
};

Deno.test('401 sem sessão válida no Auth, sem efeitos', async () => {
  const f = fixture({ authValid: false });
  assertEquals((await handleEnviarAcesso(f.req(), f.client, f.deps)).status, 401);
  assertEquals((await handleEnviarAcesso(f.req(undefined, ''), f.client, f.deps)).status, 401);
  assertEquals(f.efeitos().length, 0);
});

Deno.test('403 quando a organização ativa do staff é outra', async () => {
  const f = fixture({ orgAtiva: OUTRA_ORG });
  assertEquals((await handleEnviarAcesso(f.req(), f.client, f.deps)).status, 403);
  assertEquals(f.efeitos().length, 0);
  assertFalse(f.calls.some((c) => c.path.includes('motoristas_ativos')));
});

Deno.test('403 sem a permissão motoristas_acesso_app', async () => {
  const f = fixture({ recursos: ['motoristas_gestao'] });
  assertEquals((await handleEnviarAcesso(f.req(), f.client, f.deps)).status, 403);
  assertEquals(f.efeitos().length, 0);
});

for (const extra of [{ email: 'x@y.test' }, { password: 'Escolhida1' }, { senha: 'x' }]) {
  Deno.test(`400 quando o pedido traz ${Object.keys(extra)[0]}`, async () => {
    const f = fixture();
    const r = await handleEnviarAcesso(
      f.req({ motorista_id: FICHA, org_id: ORG, ...extra }),
      f.client,
      f.deps
    );
    assertEquals(r.status, 400);
    assertEquals(f.efeitos().length, 0);
    assertEquals(f.enviados.length, 0);
  });
}

Deno.test('404 para ficha de outra organização', async () => {
  const f = fixture({ ficha: null });
  assertEquals((await handleEnviarAcesso(f.req(), f.client, f.deps)).status, 404);
  const leitura = f.calls.find((c) => c.path.startsWith('/rest/v1/motoristas_ativos'));
  assertStringIncludes(leitura!.path, `org_id=eq.${ORG}`);
  assertEquals(f.efeitos().length, 0);
});

Deno.test('quotas: alvo 3/h por motorista, depois staff 20/h por quem chama', async () => {
  const f = fixture();
  await handleEnviarAcesso(f.req(), f.client, f.deps);
  const q = f.calls.filter((c) => c.path.endsWith('consume_edge_rate_limit')).map((c) => c.body);
  assertEquals(
    q.map((x) => [x.p_operation, x.p_limit, x.p_window_seconds]),
    [
      ['enviar-acesso-alvo', 3, 3600],
      ['enviar-acesso-staff', 20, 3600],
    ]
  );
});

for (const limitada of ['enviar-acesso-alvo', 'enviar-acesso-staff']) {
  Deno.test(`429 por ${limitada} antes de qualquer efeito`, async () => {
    const f = fixture({ limitada, ficha: fichaComConta });
    const r = await handleEnviarAcesso(f.req(), f.client, f.deps);
    assertEquals(r.status, 429);
    assertEquals(r.headers.get('Retry-After'), '600');
    assertEquals(f.efeitos().length, 0);
    assertEquals(f.enviados.length, 0);
    assertFalse(f.calls.some((c) => c.path.startsWith('/auth/v1/admin/')));
  });
}

Deno.test('409 conta_com_outros_acessos quando o perfil não é de motorista', async () => {
  const f = fixture({ ficha: fichaComConta, tipo: 'colaborador' });
  const r = await handleEnviarAcesso(f.req(), f.client, f.deps);
  assertEquals(r.status, 409);
  assertEquals((await r.json()).error, 'conta_com_outros_acessos');
  assertEquals(f.efeitos().length, 0);
});

Deno.test(
  '409 conta_com_outros_acessos com cargo que não é Motorista, mesmo sem is_admin',
  async () => {
    const f = fixture({ ficha: fichaComConta, membroCargo: 'cargo-gestor' });
    const r = await handleEnviarAcesso(f.req(), f.client, f.deps);
    assertEquals(r.status, 409);
    assertEquals((await r.json()).error, 'conta_com_outros_acessos');
    assertEquals(f.efeitos().length, 0);
  }
);

Deno.test('conta de motorista sem cargo (registo antigo) não conta como equipa', async () => {
  const f = fixture({ ficha: fichaComConta, membroCargo: null });
  const r = await handleEnviarAcesso(f.req(), f.client, f.deps);
  assertFalse((await r.json()).error === 'conta_com_outros_acessos');
});

Deno.test('409 conta_com_outros_acessos quando é admin de uma organização', async () => {
  const f = fixture({ ficha: fichaComConta, membrosAdmin: true });
  const r = await handleEnviarAcesso(f.req(), f.client, f.deps);
  assertEquals((await r.json()).error, 'conta_com_outros_acessos');
  assertEquals(f.efeitos().length, 0);
});

Deno.test(
  '409 requer_confirmacao se já entrou e não há confirmação; com confirmação envia',
  async () => {
    const f = fixture({ ficha: fichaComConta, ultimoLogin: '2026-11-01T10:00:00Z' });
    const r = await handleEnviarAcesso(f.req(), f.client, f.deps);
    assertEquals(r.status, 409);
    assertEquals((await r.json()).error, 'requer_confirmacao');
    assertEquals(f.efeitos().length, 0);

    const g = fixture({ ficha: fichaComConta, ultimoLogin: '2026-11-01T10:00:00Z' });
    const ok = await handleEnviarAcesso(
      g.req({ motorista_id: FICHA, org_id: ORG, confirmar_substituicao: true }),
      g.client,
      g.deps
    );
    assertEquals(ok.status, 200);
  }
);

Deno.test('o destinatário é o email da conta Auth, nunca o da ficha', async () => {
  const f = fixture({ ficha: fichaComConta, contaEmail: 'conta@auth.test' });
  const r = await handleEnviarAcesso(f.req(), f.client, f.deps);
  assertEquals(r.status, 200);
  assertEquals(f.enviados.length, 1);
  assertEquals(f.enviados[0].to, 'conta@auth.test');
  assertEquals(f.enviados[0].loginUrl, 'https://sul.wegest.pt/motorista/login');
  const corpo = await r.json();
  assertEquals(corpo.conta_criada, false);
  assertEquals(corpo.status, 'enviado');
  assertEquals(corpo.email_destino_mascarado, 'co***@auth.test');
});

Deno.test('ordem: senha definida, registo e só depois o email', async () => {
  const f = fixture({ ficha: fichaComConta });
  await handleEnviarAcesso(f.req(), f.client, f.deps);
  const put = f.calls.find((c) => c.method === 'PUT');
  assertEquals(put?.body.password, SENHA);
  const iPut = f.calls.indexOf(put!);
  const iRegisto = f.calls.findIndex((c) => c.path.includes('registar_acesso_provisorio'));
  assertEquals(iPut < iRegisto, true);
  assertEquals(f.calls[iRegisto].body, {
    p_motorista_id: FICHA,
    p_user_id: CONTA,
    p_enviado_por: STAFF,
    p_horas: 72,
  });
  assertEquals(f.enviados.length, 1);
});

Deno.test('ficha sem email válido: 400 ficha_sem_email', async () => {
  const f = fixture({ ficha: { ...fichaComConta, user_id: null, email: 'nao-e-email' } });
  const r = await handleEnviarAcesso(f.req(), f.client, f.deps);
  assertEquals(r.status, 400);
  assertEquals((await r.json()).error, 'ficha_sem_email');
  assertEquals(f.efeitos().length, 0);
});

Deno.test('409 fichas_duplicadas e 409 email_tem_conta sem criar nada', async () => {
  const a = fixture({ iguais: [{ id: 'outra', email: '  FICHA@x.test ' }] });
  assertEquals(
    (await (await handleEnviarAcesso(a.req(), a.client, a.deps)).json()).error,
    'fichas_duplicadas'
  );
  assertEquals(a.efeitos().length, 0);
  const b = fixture({ existente: [{ id: 'u' }] });
  assertEquals(
    (await (await handleEnviarAcesso(b.req(), b.client, b.deps)).json()).error,
    'email_tem_conta'
  );
  assertEquals(b.efeitos().length, 0);
  const c = fixture({ criarExiste: true });
  assertEquals(
    (await (await handleEnviarAcesso(c.req(), c.client, c.deps)).json()).error,
    'email_tem_conta'
  );
  assertEquals(c.enviados.length, 0);
});

Deno.test(
  'cria a conta sem senha, com app_metadata de motorista, e envia para o email da ficha',
  async () => {
    const f = fixture({ fichaDepois: NOVA });
    const r = await handleEnviarAcesso(f.req(), f.client, f.deps);
    assertEquals(r.status, 200);
    assertEquals((await r.json()).conta_criada, true);
    const criar = f.calls.find((c) => c.path === '/auth/v1/admin/users' && c.method === 'POST');
    assertEquals(criar?.body.email, 'ficha@x.test');
    assertEquals(criar?.body.email_confirm, true);
    assertFalse('password' in (criar?.body ?? {}));
    assertEquals(
      (criar?.body.app_metadata as Record<string, unknown>).tipo_utilizador,
      'motorista'
    );
    assertEquals((criar?.body.app_metadata as Record<string, unknown>).org_id, ORG);
    assertFalse(f.calls.some((c) => c.method === 'PATCH' && c.path.includes('motoristas_ativos')));
    assertEquals(f.enviados[0].to, 'ficha@x.test');
  }
);

Deno.test(
  'se o trigger ligou outra ficha, liga ESTA ficha com guarda user_id is null',
  async () => {
    const f = fixture({ fichaDepois: null });
    const r = await handleEnviarAcesso(f.req(), f.client, f.deps);
    assertEquals(r.status, 200);
    const patch = f.calls.find((c) => c.method === 'PATCH' && c.path.includes('motoristas_ativos'));
    assertStringIncludes(patch!.path, `id=eq.${FICHA}`);
    assertStringIncludes(patch!.path, 'user_id=is.null');
    assertEquals(patch?.body.user_id, NOVA);
  }
);

Deno.test('candidata que só contém o email como parte de outro não é duplicada', async () => {
  const f = fixture({ iguais: [{ id: 'outra', email: 'xficha@x.test' }], fichaDepois: NOVA });
  assertEquals((await handleEnviarAcesso(f.req(), f.client, f.deps)).status, 200);
});

Deno.test(
  '500 registo_falhou: troca a senha por outra desconhecida e não envia email',
  async () => {
    const silencio = stub(console, 'error', () => {});
    try {
      const f = fixture({ ficha: fichaComConta, registarFalha: true });
      const r = await handleEnviarAcesso(f.req(), f.client, f.deps);
      assertEquals(r.status, 500);
      const corpo = await r.json();
      assertEquals(corpo.error, 'registo_falhou');
      assertStringIncludes(corpo.mensagem, 'Tente de novo');
      assertEquals(f.enviados.length, 0);
      const puts = f.calls.filter((c) => c.method === 'PUT');
      assertEquals(puts.length, 2);
      assertEquals(puts[0].body.password, SENHA);
      assertEquals((puts[1].body.password as string).length, 40);
      assertFalse(JSON.stringify(corpo).includes(SENHA));
    } finally {
      silencio.restore();
    }
  }
);

Deno.test('409 se não consegue ligar a ficha: nenhuma senha, nenhum email', async () => {
  const f = fixture({ fichaDepois: null, ligarFalha: true });
  const r = await handleEnviarAcesso(f.req(), f.client, f.deps);
  assertEquals(r.status, 409);
  assertEquals((await r.json()).error, 'ligacao_conta_falhou');
  assertEquals(f.enviados.length, 0);
  // A conta acabada de criar é apagada para não ficar órfã a ocupar o email.
  assertEquals(
    f.calls.filter((c) => c.method === 'DELETE').map((c) => c.path),
    [`/auth/v1/admin/users/${NOVA}`]
  );
  assertFalse(f.calls.some((c) => c.method === 'PUT'));
});

Deno.test('502 email_nao_enviado quando a entrega falha', async () => {
  const f = fixture({ ficha: fichaComConta, emailOk: false });
  const r = await handleEnviarAcesso(f.req(), f.client, f.deps);
  assertEquals(r.status, 502);
  const corpo = await r.json();
  assertEquals(corpo.error, 'email_nao_enviado');
  assertStringIncludes(corpo.mensagem, 'não foi entregue');
});

Deno.test('a senha nunca vai na resposta nem nos logs', async () => {
  const logs: string[] = [];
  const espiar = stub(console, 'error', (...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  });
  const espiarLog = stub(console, 'log', (...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  });
  try {
    for (const emailOk of [true, false]) {
      const f = fixture({ ficha: fichaComConta, emailOk });
      const r = await handleEnviarAcesso(f.req(), f.client, f.deps);
      assertFalse((await r.text()).includes(SENHA));
    }
  } finally {
    espiar.restore();
    espiarLog.restore();
  }
  assertFalse(logs.join('\n').includes(SENHA));
});
