// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import worker, { ORIGEM, tratar } from './worker.js';

const fetchQueResponde = (resposta) => vi.fn(async () => resposta.clone());

describe('Worker api.wegest.pt', () => {
  it('GET / apresenta a API sem ir à origem', async () => {
    const f = vi.fn();
    const r = await tratar(new Request('https://api.wegest.pt/'), f);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      nome: 'WeGest — API Rent-a-Car',
      versao: '1.0.0',
      documentacao: 'https://docs.wegest.pt',
    });
    expect(f).not.toHaveBeenCalled();
  });

  it('fora de /v1 → 404 no envelope de erro, sem ir à origem', async () => {
    const f = vi.fn();
    for (const caminho of ['/v2/modelos', '/v1x', '/favicon.ico', '/api/rent-a-car/v1/modelos']) {
      const r = await tratar(new Request(`https://api.wegest.pt${caminho}`), f);
      expect(r.status, caminho).toBe(404);
      expect(await r.json()).toEqual({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Rota inexistente. A API vive em /v1.' },
      });
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('passa caminho e query para a edge function', async () => {
    const f = fetchQueResponde(new Response('[]'));
    await tratar(new Request('https://api.wegest.pt/v1/modelos?tipo=comercial&categoria=x'), f);
    const pedido = f.mock.calls[0][0];
    expect(pedido.url).toBe(`${ORIGEM}/v1/modelos?tipo=comercial&categoria=x`);
    expect(ORIGEM).toBe('https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/api-rent-a-car');
    expect(pedido.method).toBe('GET');
  });

  it('/v1 sem recurso também segue para a origem', async () => {
    const f = fetchQueResponde(new Response('{}'));
    await tratar(new Request('https://api.wegest.pt/v1'), f);
    expect(f.mock.calls[0][0].url).toBe(`${ORIGEM}/v1`);
  });

  it('POST passa método e corpo', async () => {
    const f = fetchQueResponde(new Response('{}', { status: 201 }));
    const corpo = JSON.stringify({ modelo_id: 'm1', inicio: '2026-10-10T10:00:00Z' });
    const r = await tratar(
      new Request('https://api.wegest.pt/v1/reservas', {
        method: 'POST',
        body: corpo,
        headers: { 'content-type': 'application/json' },
      }),
      f
    );
    const pedido = f.mock.calls[0][0];
    expect(pedido.method).toBe('POST');
    expect(await pedido.text()).toBe(corpo);
    expect(r.status).toBe(201);
  });

  it('passa X-API-Key, Authorization, Content-Type e Origin; não passa Host nem cookies', async () => {
    const f = fetchQueResponde(new Response('{}'));
    await tratar(
      new Request('https://api.wegest.pt/v1/health', {
        headers: {
          'x-api-key': 'wg_ra_abc',
          authorization: 'Bearer wg_ra_abc',
          'content-type': 'application/json',
          origin: 'https://docs.wegest.pt',
          cookie: 'sessao=1',
        },
      }),
      f
    );
    const h = f.mock.calls[0][0].headers;
    expect(h.get('x-api-key')).toBe('wg_ra_abc');
    expect(h.get('authorization')).toBe('Bearer wg_ra_abc');
    expect(h.get('content-type')).toBe('application/json');
    expect(h.get('origin')).toBe('https://docs.wegest.pt');
    expect(h.get('cookie')).toBeNull();
    expect(h.get('host')).toBeNull();
  });

  it('não guarda em cache no Worker', async () => {
    const f = fetchQueResponde(new Response('{}'));
    await tratar(new Request('https://api.wegest.pt/v1/modelos'), f);
    expect(f.mock.calls[0][0].cache).toBe('no-store');
  });

  it('devolve a resposta tal qual: status, corpo e cabeçalhos', async () => {
    const origem = new Response(JSON.stringify({ erro: { codigo: 'LIMITE_EXCEDIDO' } }), {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'private, max-age=300',
        vary: 'Origin, X-API-Key, Authorization',
        'retry-after': '42',
        'access-control-allow-origin': 'https://docs.wegest.pt',
        'access-control-expose-headers': 'Retry-After',
      },
    });
    const r = await tratar(
      new Request('https://api.wegest.pt/v1/modelos'),
      fetchQueResponde(origem)
    );
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ erro: { codigo: 'LIMITE_EXCEDIDO' } });
    expect(r.headers.get('cache-control')).toBe('private, max-age=300');
    expect(r.headers.get('vary')).toBe('Origin, X-API-Key, Authorization');
    expect(r.headers.get('retry-after')).toBe('42');
    expect(r.headers.get('access-control-allow-origin')).toBe('https://docs.wegest.pt');
    expect(r.headers.get('access-control-expose-headers')).toBe('Retry-After');
  });

  it('origem em baixo → 502 no envelope de erro', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const r = await tratar(new Request('https://api.wegest.pt/v1/modelos'), f);
    expect(r.status).toBe(502);
    expect((await r.json()).erro.codigo).toBe('ERRO_INTERNO');
  });

  it('caminho com % ou fora do formato → 404 sem ir à origem', async () => {
    const f = vi.fn();
    for (const caminho of [
      '/v1/..%2f..%2fauth',
      '/v1/modelos%2f..',
      '/v1/%2e%2e/auth',
      '/v1/modelos/abc/extra',
      `/v1/${'a'.repeat(65)}`,
      '/v1//modelos',
    ]) {
      const r = await tratar(new Request(`https://api.wegest.pt${caminho}`), f);
      expect(r.status, caminho).toBe(404);
      expect((await r.json()).erro.codigo).toBe('NAO_ENCONTRADO');
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('recurso e id válidos continuam a seguir para a origem', async () => {
    for (const caminho of [
      '/v1/',
      '/v1/openapi.json',
      '/v1/reservas/abc_1-2',
      '/v1/reservas/abc/',
    ]) {
      const f = fetchQueResponde(new Response('{}'));
      await tratar(new Request(`https://api.wegest.pt${caminho}`), f);
      expect(f, caminho).toHaveBeenCalledTimes(1);
      expect(f.mock.calls[0][0].url).toBe(`${ORIGEM}${caminho}`);
    }
  });

  it('só os cabeçalhos da lista de inclusão seguem; IP forjado pelo cliente fica', async () => {
    const f = fetchQueResponde(new Response('{}'));
    await tratar(
      new Request('https://api.wegest.pt/v1/health', {
        headers: {
          'x-api-key': 'wg_ra_abc',
          accept: 'application/json',
          'accept-encoding': 'gzip',
          'user-agent': 'site/1.0',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'x-api-key',
          'x-forwarded-for': '10.0.0.1',
          'x-real-ip': '10.0.0.1',
          'true-client-ip': '10.0.0.1',
          'cf-connecting-ip': '10.0.0.1',
          'x-qualquer': '1',
        },
      }),
      f
    );
    const h = f.mock.calls[0][0].headers;
    expect(h.get('x-api-key')).toBe('wg_ra_abc');
    expect(h.get('accept')).toBe('application/json');
    expect(h.get('accept-encoding')).toBe('gzip');
    expect(h.get('user-agent')).toBe('site/1.0');
    expect(h.get('access-control-request-method')).toBe('POST');
    expect(h.get('access-control-request-headers')).toBe('x-api-key');
    for (const nome of [
      'x-forwarded-for',
      'x-real-ip',
      'true-client-ip',
      'cf-connecting-ip',
      'x-qualquer',
    ]) {
      expect(h.get(nome), nome).toBeNull();
    }
  });

  it('tira o Set-Cookie da resposta da origem e mantém o resto', async () => {
    const origem = new Response('{}', {
      status: 200,
      statusText: 'OK',
      headers: { 'set-cookie': 'sb=1; Path=/', 'cache-control': 'private, max-age=60' },
    });
    const r = await tratar(
      new Request('https://api.wegest.pt/v1/modelos'),
      fetchQueResponde(origem)
    );
    expect(r.headers.get('set-cookie')).toBeNull();
    expect(r.headers.get('cache-control')).toBe('private, max-age=60');
    expect(r.statusText).toBe('OK');
  });

  it('Content-Length acima de 64 KiB → 413 CORPO_INVALIDO sem ler o corpo nem ir à origem', async () => {
    const f = vi.fn();
    const pedido = new Request('https://api.wegest.pt/v1/reservas', {
      method: 'POST',
      body: 'x'.repeat(10),
      headers: { 'content-type': 'application/json', 'content-length': '65537' },
    });
    const r = await tratar(pedido, f);
    expect(r.status).toBe(413);
    expect((await r.json()).erro.codigo).toBe('CORPO_INVALIDO');
    expect(pedido.bodyUsed).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it('corpo sem Content-Length acima de 64 KiB → 413 sem ir à origem', async () => {
    const f = vi.fn();
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('x'.repeat(65537)));
        c.close();
      },
    });
    const r = await tratar(
      new Request('https://api.wegest.pt/v1/reservas', {
        method: 'POST',
        body: stream,
        duplex: 'half',
      }),
      f
    );
    expect(r.status).toBe(413);
    expect(f).not.toHaveBeenCalled();
  });

  it('corpo de 64 KiB exactos segue para a origem', async () => {
    const f = fetchQueResponde(new Response('{}', { status: 201 }));
    const r = await tratar(
      new Request('https://api.wegest.pt/v1/reservas', { method: 'POST', body: 'x'.repeat(65536) }),
      f
    );
    expect(r.status).toBe(201);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('404 e 502 do Worker levam CORS para as origens permitidas, com Vary: Origin', async () => {
    const emBaixo = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    for (const origem of ['https://wegest.pt', 'https://www.wegest.pt', 'https://docs.wegest.pt']) {
      const r404 = await tratar(
        new Request('https://api.wegest.pt/x', { headers: { origin: origem } })
      );
      expect(r404.headers.get('access-control-allow-origin'), origem).toBe(origem);
      expect(r404.headers.get('vary')).toBe('Origin');
      const r502 = await tratar(
        new Request('https://api.wegest.pt/v1/modelos', { headers: { origin: origem } }),
        emBaixo
      );
      expect(r502.status).toBe(502);
      expect(r502.headers.get('access-control-allow-origin'), origem).toBe(origem);
      expect(r502.headers.get('vary')).toBe('Origin');
    }
    for (const origem of ['https://evil.example', 'https://docs.wegest.pt.evil.example']) {
      const r = await tratar(
        new Request('https://api.wegest.pt/x', { headers: { origin: origem } })
      );
      expect(r.headers.get('access-control-allow-origin'), origem).toBeNull();
      expect(r.headers.get('vary')).toBe('Origin');
    }
  });

  it('o export default é o handler fetch do Cloudflare', () => {
    expect(typeof worker.fetch).toBe('function');
  });
});
