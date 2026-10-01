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

  it('o export default é o handler fetch do Cloudflare', () => {
    expect(typeof worker.fetch).toBe('function');
  });
});
