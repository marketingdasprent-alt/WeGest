import { assertEquals } from 'jsr:@std/assert@1.0.19';
import { captchaResponse, verificarCaptcha } from './turnstile.ts';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function comSegredo<T>(segredo: string | undefined, run: () => Promise<T>): Promise<T> {
  const anterior = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (segredo === undefined) Deno.env.delete('TURNSTILE_SECRET_KEY');
  else Deno.env.set('TURNSTILE_SECRET_KEY', segredo);
  return run().finally(() => {
    if (anterior === undefined) Deno.env.delete('TURNSTILE_SECRET_KEY');
    else Deno.env.set('TURNSTILE_SECRET_KEY', anterior);
  });
}

Deno.test('sem segredo configurado o CAPTCHA fica desligado e não chama a Cloudflare', async () => {
  let chamadas = 0;
  const decisao = await comSegredo(undefined, () =>
    verificarCaptcha(undefined, '203.0.113.1', () => {
      chamadas++;
      return Promise.resolve(Response.json({ success: true }));
    })
  );
  assertEquals(decisao, { ok: true, ativo: false });
  assertEquals(chamadas, 0);
});

for (const token of [undefined, '', 42, 'x'.repeat(2049)]) {
  Deno.test(`com segredo, token ${JSON.stringify(token)?.slice(0, 20)} é recusado sem chamar a Cloudflare`, async () => {
    let chamadas = 0;
    const decisao = await comSegredo('segredo', () =>
      verificarCaptcha(token, '203.0.113.1', () => {
        chamadas++;
        return Promise.resolve(Response.json({ success: true }));
      })
    );
    assertEquals(decisao, { ok: false, status: 400 });
    assertEquals(chamadas, 0);
  });
}

Deno.test('token válido: envia segredo, token e IP à Cloudflare e deixa passar', async () => {
  let pedido: { url: string; body: string } | null = null;
  const decisao = await comSegredo('segredo', () =>
    verificarCaptcha('token-bom', '203.0.113.1', async (input, init) => {
      pedido = { url: String(input), body: String(init?.body) };
      return Response.json({ success: true });
    })
  );
  assertEquals(decisao, { ok: true, ativo: true });
  assertEquals(pedido!.url, SITEVERIFY);
  const campos = new URLSearchParams(pedido!.body);
  assertEquals(
    [campos.get('secret'), campos.get('response'), campos.get('remoteip')],
    ['segredo', 'token-bom', '203.0.113.1']
  );
});

Deno.test('IP desconhecido não é enviado à Cloudflare', async () => {
  let corpo = '';
  await comSegredo('segredo', () =>
    verificarCaptcha('token-bom', 'unknown', async (_input, init) => {
      corpo = String(init?.body);
      return Response.json({ success: true });
    })
  );
  assertEquals(new URLSearchParams(corpo).has('remoteip'), false);
});

Deno.test('token recusado pela Cloudflare dá 400', async () => {
  const decisao = await comSegredo('segredo', () =>
    verificarCaptcha('token-mau', '203.0.113.1', () =>
      Promise.resolve(Response.json({ success: false, 'error-codes': ['invalid-input-response'] }))
    )
  );
  assertEquals(decisao, { ok: false, status: 400 });
});

Deno.test('Cloudflare indisponível falha fechado com 503', async () => {
  for (const falha of [
    () => Promise.reject(new TypeError('rede')),
    () => Promise.resolve(new Response('erro', { status: 500 })),
  ]) {
    const decisao = await comSegredo('segredo', () => verificarCaptcha('token', '203.0.113.1', falha));
    assertEquals(decisao, { ok: false, status: 503 });
  }
});

Deno.test('captchaResponse só responde quando o CAPTCHA recusa', async () => {
  assertEquals(captchaResponse({ ok: true, ativo: true }, {}), null);
  const recusa = captchaResponse({ ok: false, status: 400 }, { 'X-Cors': '1' });
  assertEquals(recusa?.status, 400);
  assertEquals(recusa?.headers.get('X-Cors'), '1');
  assertEquals(((await recusa?.json()) as { success: boolean }).success, false);
});
