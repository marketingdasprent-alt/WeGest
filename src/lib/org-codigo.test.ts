import { describe, it, expect, vi, beforeEach } from 'vitest';

// Passou de .from('organizacoes') para .rpc('org_por_codigo'): o `anon` já não
// tem SELECT na tabela, para que os códigos de organização deixem de ser
// enumeráveis (GET /organizacoes?select=codigo listava as 5 orgs).
const rpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (fn: string, args: unknown) => rpc(fn, args) },
}));

import { resolveOrgByCodigo, normalizeCodigo } from './org-codigo';

describe('normalizeCodigo', () => {
  it('faz trim e lowercase', () => {
    expect(normalizeCodigo('  DeCaDa  ')).toBe('decada');
  });
});

describe('resolveOrgByCodigo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('devolve null para código vazio (sem chamar a RPC)', async () => {
    expect(await resolveOrgByCodigo('   ')).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('devolve a org quando o código existe e está ativa', async () => {
    rpc.mockResolvedValue({ data: { id: 'org-x', nome: 'Empresa X' }, error: null });
    const org = await resolveOrgByCodigo('Empresa-X');
    expect(org).toEqual({ id: 'org-x', nome: 'Empresa X' });
    expect(rpc).toHaveBeenCalledWith('org_por_codigo', { p_codigo: 'empresa-x' });
  });

  it('devolve null quando não há org (a RPC devolve null)', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await resolveOrgByCodigo('xpto')).toBeNull();
  });

  it('devolve null quando a RPC dá erro', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    expect(await resolveOrgByCodigo('xpto')).toBeNull();
  });
});
