import { describe, it, expect, vi, beforeEach } from 'vitest';

const maybeSingle = vi.fn();
const eqAtiva = vi.fn(() => ({ maybeSingle }));
const eqCodigo = vi.fn(() => ({ eq: eqAtiva }));
const select = vi.fn(() => ({ eq: eqCodigo }));
const from = vi.fn((_table: string) => ({ select }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (t: string) => from(t) },
}));

import { resolveOrgByCodigo, normalizeCodigo } from './org-codigo';

describe('normalizeCodigo', () => {
  it('faz trim e lowercase', () => {
    expect(normalizeCodigo('  DeCaDa  ')).toBe('decada');
  });
});

describe('resolveOrgByCodigo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('devolve null para código vazio (sem query)', async () => {
    expect(await resolveOrgByCodigo('   ')).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('devolve a org quando o código existe e está ativa', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'org-x', nome: 'Empresa X' }, error: null });
    const org = await resolveOrgByCodigo('Empresa-X');
    expect(org).toEqual({ id: 'org-x', nome: 'Empresa X' });
    expect(from).toHaveBeenCalledWith('organizacoes');
    expect(eqCodigo).toHaveBeenCalledWith('codigo', 'empresa-x');
    expect(eqAtiva).toHaveBeenCalledWith('ativa', true);
  });

  it('devolve null quando não há org', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await resolveOrgByCodigo('xpto')).toBeNull();
  });

  it('devolve null quando a query dá erro', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'rls' } });
    expect(await resolveOrgByCodigo('xpto')).toBeNull();
  });
});
