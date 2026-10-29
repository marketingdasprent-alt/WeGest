import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  user: { id: 'u-1' } as { id: string } | null,
  perfil: { data: null as unknown, error: null as unknown },
}));

vi.mock('@/integrations/supabase/client', () => {
  const cadeia = {
    select: () => cadeia,
    eq: () => cadeia,
    maybeSingle: () => Promise.resolve(m.perfil),
  };
  return {
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: m.user } }) },
      from: () => cadeia,
    },
  };
});

import { carregarColaboradorQueImprime } from './colaboradorQueImprime';

beforeEach(() => {
  m.user = { id: 'u-1' };
  m.perfil = { data: null, error: null };
});

describe('carregarColaboradorQueImprime', () => {
  it('devolve o nome e a assinatura do perfil de quem está ligado', async () => {
    m.perfil = {
      data: { nome: 'Ana Gestora', assinatura_url: 'data:image/png;base64,A' },
      error: null,
    };
    expect(await carregarColaboradorQueImprime()).toEqual({
      nome: 'Ana Gestora',
      assinatura: 'data:image/png;base64,A',
    });
  });

  it('sem assinatura desenhada devolve vazio', async () => {
    m.perfil = { data: { nome: 'Ana Gestora', assinatura_url: null }, error: null };
    expect((await carregarColaboradorQueImprime()).assinatura).toBe('');
  });

  it('sem sessão não pergunta pelo perfil', async () => {
    m.user = null;
    expect(await carregarColaboradorQueImprime()).toEqual({ nome: '', assinatura: '' });
  });

  it('erro ao ler o perfil: o documento continua, só sai por assinar', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    m.perfil = { data: null, error: { message: 'Failed to fetch' } };
    expect(await carregarColaboradorQueImprime()).toEqual({ nome: '', assinatura: '' });
    expect(console.warn).toHaveBeenCalled();
  });
});
