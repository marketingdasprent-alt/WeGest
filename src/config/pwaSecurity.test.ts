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
