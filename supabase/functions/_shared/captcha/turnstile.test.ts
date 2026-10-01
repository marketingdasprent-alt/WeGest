import { assertEquals } from 'jsr:@std/assert@1.0.19';
import { captchaResponse, verificarCaptcha } from './turnstile.ts';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const ACAO = 'contacto';

function comAmbiente<T>(
  valores: Record<string, string | undefined>,
  run: () => Promise<T>
): Promise<T> {
  const anteriores = Object.fromEntries(Object.keys(valores).map((k) => [k, Deno.env.get(k)]));
  const aplicar = (v: Record<string, string | undefined>) => {
    for (const [k, valor] of Object.entries(v)) {
      if (valor === undefined) Deno.env.delete(k);
      else Deno.env.set(k, valor);
    }
  };
  aplicar(valores);
  return run().finally(() => aplicar(anteriores));
}
const comSegredo = <T>(segredo: string | undefined, run: () => Promise<T>) =>
  comAmbiente({ TURNSTILE_SECRET_KEY: segredo, TURNSTILE_HOSTNAMES: undefined }, run);

const cloudflare =
  (resultado: Record<string, unknown>): typeof fetch =>
  () =>
    Promise.resolve(Response.json(resultado));
const valido = { success: true, action: ACAO, hostname: 'wegest.pt' };

Deno.test('sem segredo configurado o CAPTCHA fica desligado e não chama a Cloudflare', async () => {
  let chamadas = 0;
  const decisao = await comSegredo(undefined, () =>
    verificarCaptcha(undefined, '203.0.113.1', ACAO, () => {
      chamadas++;
      return Promise.resolve(Response.json(valido));
    })
  );
  assertEquals(decisao, { ok: true, ativo: false });
  assertEquals(chamadas, 0);
});

for (const token of [undefined, '', 42, 'x'.repeat(2049)]) {
  Deno.test(
    `com segredo, token ${JSON.stringify(token)?.slice(0, 20)} é recusado sem chamar a Cloudflare`,
    async () => {
      let chamadas = 0;
      const decisao = await comSegredo('segredo', () =>
        verificarCaptcha(token, '203.0.113.1', ACAO, () => {
          chamadas++;
          return Promise.resolve(Response.json(valido));
        })
      );
      assertEquals(decisao, { ok: false, status: 403 });
      assertEquals(chamadas, 0);
    }
  );
}

Deno.test(
  'token válido: envia segredo, token e IP (form-urlencoded, com timeout) e deixa passar',
  async () => {
    let pedido: { url: string; init?: RequestInit } | null = null;
    const decisao = await comSegredo('segredo', () =>
      verificarCaptcha('token-bom', '203.0.113.1', ACAO, async (input, init) => {
        pedido = { url: String(input), init };
        return Response.json(valido);
      })
    );
    assertEquals(decisao, { ok: true, ativo: true });
    assertEquals(pedido!.url, SITEVERIFY);
    assertEquals(pedido!.init?.signal instanceof AbortSignal, true);
    const campos = new URLSearchParams(String(pedido!.init?.body));
    assertEquals(
      [campos.get('secret'), campos.get('response'), campos.get('remoteip')],
      ['segredo', 'token-bom', '203.0.113.1']
    );
  }
);

Deno.test('IP desconhecido não é enviado à Cloudflare', async () => {
  let corpo = '';
  await comSegredo('segredo', () =>
    verificarCaptcha('token-bom', 'unknown', ACAO, async (_input, init) => {
      corpo = String(init?.body);
      return Response.json(valido);
    })
  );
  assertEquals(new URLSearchParams(corpo).has('remoteip'), false);
});

Deno.test('token recusado pela Cloudflare dá 403', async () => {
  const decisao = await comSegredo('segredo', () =>
    verificarCaptcha('token-mau', '203.0.113.1', ACAO, cloudflare({ success: false }))
  );
  assertEquals(decisao, { ok: false, status: 403 });
});

// Um token só vale para o formulário onde foi resolvido.
Deno.test('token de outro formulário (action diferente) dá 403', async () => {
  const decisao = await comSegredo('segredo', () =>
    verificarCaptcha('token', '203.0.113.1', ACAO, cloudflare({ ...valido, action: 'registo_org' }))
  );
  assertEquals(decisao, { ok: false, status: 403 });
});

Deno.test('hostname: aceita wegest.pt e subdomínios, recusa outros e localhost', async () => {
  for (const [hostname, esperado] of [
    ['wegest.pt', true],
    ['www.wegest.pt', true],
    ['premium.wegest.pt', true],
    ['tickets.wegest.pt', true],
    ['wegest.pt.atacante.com', false],
    ['naowegest.pt', false],
    ['localhost', false],
    ['wegest-git-x.vercel.app', false],
  ] as const) {
    const decisao = await comSegredo('segredo', () =>
      verificarCaptcha('token', '203.0.113.1', ACAO, cloudflare({ ...valido, hostname }))
    );
    assertEquals(decisao.ok, esperado, hostname);
  }
});

Deno.test('TURNSTILE_HOSTNAMES substitui a lista por omissão', async () => {
  const decisao = await comAmbiente(
    { TURNSTILE_SECRET_KEY: 'segredo', TURNSTILE_HOSTNAMES: 'preview.example.com' },
    () =>
      verificarCaptcha(
        'token',
        '203.0.113.1',
        ACAO,
        cloudflare({ ...valido, hostname: 'preview.example.com' })
      )
  );
  assertEquals(decisao, { ok: true, ativo: true });
});

Deno.test('Cloudflare indisponível falha fechado com 503', async () => {
  for (const falha of [
    () => Promise.reject(new TypeError('rede')),
    () => Promise.reject(new DOMException('timeout', 'TimeoutError')),
    () => Promise.resolve(new Response('erro', { status: 500 })),
  ]) {
    const decisao = await comSegredo('segredo', () =>
      verificarCaptcha('token', '203.0.113.1', ACAO, falha)
    );
    assertEquals(decisao, { ok: false, status: 503 });
  }
});

Deno.test('captchaResponse só responde quando o CAPTCHA recusa', async () => {
  assertEquals(captchaResponse({ ok: true, ativo: true }, {}), null);
  const recusa = captchaResponse({ ok: false, status: 403 }, { 'X-Cors': '1' });
  assertEquals(recusa?.status, 403);
  assertEquals(recusa?.headers.get('X-Cors'), '1');
  assertEquals(((await recusa?.json()) as { success: boolean }).success, false);
});
