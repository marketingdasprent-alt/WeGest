import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('cache PWA', () => {
  it('não persiste respostas autenticadas do Supabase no Cache Storage', () => {
    const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');

    expect(config).not.toContain('supabase-cache');
    expect(config).not.toMatch(/urlPattern:\s*\/\^https:[^\n]+supabase/i);
  });

  it('remove explicitamente o cache autenticado deixado por versões antigas', () => {
    const main = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');

    expect(main).toContain('removeLegacyAuthenticatedCache');
  });
});

describe('service worker e o formulário incorporável', () => {
  const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');

  it('o index.html está no precache, senão o SW rebenta ao arrancar e nunca instala', () => {
    expect(config).toMatch(/globPatterns:\s*\['index\.html'/);
  });

  it('/formulario/ nunca é servido do precache: o index.html guardado traz X-Frame-Options DENY', () => {
    // A partir da segunda abertura o iframe do site da organização ficava em
    // branco (13/10/2026, site da Década Ousada). O formulário vai sempre à rede.
    const denylist = config.match(/navigateFallbackDenylist:\s*\[([^\]]*)\]/)?.[1] ?? '';
    expect(denylist).toContain('/^\\/formulario\\//');
  });

  it('o portal do motorista e o /login também vão sempre à rede (embebidos no site da Década)', () => {
    const denylist = config.match(/navigateFallbackDenylist:\s*\[([^\]]*)\]/)?.[1] ?? '';
    expect(denylist).toContain('/^\\/motorista\\//');
    expect(denylist).toContain('/^\\/login$/');
  });
});
