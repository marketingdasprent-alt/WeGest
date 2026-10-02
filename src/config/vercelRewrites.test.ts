import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Rewrite {
  source: string;
  destination: string;
  missing?: { type: string; value: string }[];
}

const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
  rewrites: Rewrite[];
};

describe('rewrites da Vercel', () => {
  it('wegest.pt/api/rent-a-car[/*] (vazio incluído) vai para a edge function api-rent-a-car', () => {
    const api = config.rewrites.find((r) => r.source === '/api/rent-a-car/:path*');
    expect(api?.destination).toBe(
      'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/api-rent-a-car/:path*'
    );
  });

  it('em docs.wegest.pt o /api/rent-a-car não chega à edge function', () => {
    const api = config.rewrites.find((r) => r.source === '/api/rent-a-car/:path*');
    expect(api?.missing).toEqual([{ type: 'host', value: 'docs.wegest.pt' }]);
  });

  it('o catch-all da SPA vem depois: senão engolia a API com o index.html', () => {
    const indiceApi = config.rewrites.findIndex((r) => r.source === '/api/rent-a-car/:path*');
    const indiceSpa = config.rewrites.findIndex((r) => r.source === '/(.*)');
    expect(indiceApi).toBeGreaterThanOrEqual(0);
    expect(indiceSpa).toBe(config.rewrites.length - 1);
    expect(indiceApi).toBeLessThan(indiceSpa);
  });
});

describe('docs.wegest.pt na Vercel', () => {
  const completo = config as unknown as {
    rewrites: (Rewrite & { has?: { type: string; value: string }[] })[];
    redirects: (Rewrite & { has?: { type: string; value: string }[]; permanent: boolean })[];
  };
  const doHostDocs = (r: { has?: { type: string; value: string }[] }) =>
    r.has?.some((h) => h.type === 'host' && h.value === 'docs.wegest.pt') ?? false;

  it('no host docs.wegest.pt todo o caminho vai para /docs/*, antes do catch-all da SPA', () => {
    const i = completo.rewrites.findIndex(doHostDocs);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(completo.rewrites[i]).toMatchObject({ source: '/:path*', destination: '/docs/:path*' });
    expect(i).toBeLessThan(completo.rewrites.findIndex((r) => r.source === '/(.*)'));
  });

  it('o rewrite por host não se aplica aos outros domínios', () => {
    const semHost = completo.rewrites.filter((r) => r.destination.startsWith('/docs'));
    expect(semHost.every(doHostDocs)).toBe(true);
  });

  it('/api/docs redirecciona para https://docs.wegest.pt', () => {
    const r = completo.redirects.find((x) => x.source === '/api/docs');
    expect(r?.destination).toBe('https://docs.wegest.pt');
    expect(r?.has).toBeUndefined();
  });

  it('em docs.wegest.pt um /docs/* a mais volta à raiz', () => {
    const r = completo.redirects.find((x) => x.source === '/docs/:path*');
    expect(r && doHostDocs(r)).toBe(true);
    expect(r?.destination).toBe('/:path*');
  });
});
