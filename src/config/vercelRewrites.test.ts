import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Rewrite {
  source: string;
  destination: string;
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

  it('o catch-all da SPA vem depois: senão engolia a API com o index.html', () => {
    const indiceApi = config.rewrites.findIndex((r) => r.source === '/api/rent-a-car/:path*');
    const indiceSpa = config.rewrites.findIndex((r) => r.source === '/(.*)');
    expect(indiceApi).toBeGreaterThanOrEqual(0);
    expect(indiceSpa).toBe(config.rewrites.length - 1);
    expect(indiceApi).toBeLessThan(indiceSpa);
  });
});
