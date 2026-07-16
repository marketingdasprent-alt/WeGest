import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { findLeadMatch } from './leadMatch';

function chainable(result: { data: unknown; error: unknown }) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {};
  c.select = vi.fn().mockReturnValue(c);
  c.or = vi.fn().mockReturnValue(c);
  c.order = vi.fn().mockReturnValue(c);
  c.limit = vi.fn().mockResolvedValue(result);
  return c;
}

describe('findLeadMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devolve null sem email nem telefone (não faz query nenhuma)', async () => {
    const fromSpy = vi.fn();
    (supabase as unknown as { from: typeof fromSpy }).from = fromSpy;

    const result = await findLeadMatch(null, null);

    expect(result).toBeNull();
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('faz match por email OU telefone (últimos 9 dígitos), devolve o mais recente', async () => {
    const found = {
      id: 'lead-1',
      nome: 'Ana Costa',
      email: 'ana@exemplo.com',
      telefone: '+351 912345678',
      caucao_valor: 300,
    };
    const chain = chainable({ data: [found], error: null });
    (supabase as unknown as { from: ReturnType<typeof vi.fn> }).from = vi
      .fn()
      .mockReturnValue(chain);

    const result = await findLeadMatch('Ana@Exemplo.com', '912 345 678');

    expect(chain.or).toHaveBeenCalledWith('email.ilike.ana@exemplo.com,telefone.ilike.%912345678%');
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(1);
    expect(result).toEqual(found);
  });

  it('sem resultados devolve null', async () => {
    const chain = chainable({ data: [], error: null });
    (supabase as unknown as { from: ReturnType<typeof vi.fn> }).from = vi
      .fn()
      .mockReturnValue(chain);

    const result = await findLeadMatch('ninguem@exemplo.com', null);

    expect(result).toBeNull();
  });

  it('propaga erro do Postgres em vez de o engolir', async () => {
    const pgError = { message: 'boom', code: '500' };
    const chain = chainable({ data: null, error: pgError });
    (supabase as unknown as { from: ReturnType<typeof vi.fn> }).from = vi
      .fn()
      .mockReturnValue(chain);

    await expect(findLeadMatch('erro@exemplo.com', null)).rejects.toEqual(pgError);
  });
});
