import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

const mockPerfis = vi.fn();
vi.mock('@/hooks/usePerfisOrg', () => ({
  fetchPerfisOrg: (...args: unknown[]) => mockPerfis(...args),
}));

import {
  fetchTicketLigado,
  fetchTicketsDaViatura,
  ligarDanoATicket,
  numeroTicket,
} from './useDanoTicket';

// Cadeia do query builder: cada método devolve a cadeia; `ultimo` resolve com `result`.
function cadeia(result: { data: unknown; error: unknown }, ultimo: string) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'update', 'order', 'maybeSingle']) {
    chain[m] = vi.fn(() => (m === ultimo ? Promise.resolve(result) : chain));
  }
  return chain as Record<string, ReturnType<typeof vi.fn>>;
}

beforeEach(() => vi.clearAllMocks());

describe('numeroTicket', () => {
  it('formata como na Assistência', () => {
    expect(numeroTicket(12)).toBe('#0012');
  });
});

describe('fetchTicketsDaViatura', () => {
  it('chama a RPC com a viatura', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 't1' }], error: null });
    const r = await fetchTicketsDaViatura('v1');
    expect(mockRpc).toHaveBeenCalledWith('tickets_da_viatura_para_ligar', { p_viatura_id: 'v1' });
    expect(r).toEqual([{ id: 't1' }]);
  });

  it('propaga o erro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(fetchTicketsDaViatura('v1')).rejects.toThrow('boom');
  });
});

describe('fetchTicketLigado', () => {
  it('junta o ticket, as mensagens e o nome de quem as escreveu', async () => {
    const ticket = cadeia(
      {
        data: {
          id: 't1',
          numero: 7,
          titulo: 'Sinistro',
          descricao: null,
          status: 'aberto',
          created_at: 'x',
        },
        error: null,
      },
      'maybeSingle'
    );
    const msgs = cadeia(
      {
        data: [
          {
            id: 'm1',
            mensagem: 'Peritagem dia 13',
            tipo: 'nota_interna',
            created_at: 'y',
            autor_id: 'u1',
          },
        ],
        error: null,
      },
      'order'
    );
    mockFrom.mockImplementation((t: string) => (t === 'assistencia_tickets' ? ticket : msgs));
    mockPerfis.mockResolvedValue([{ id: 'u1', nome: 'Chris' }]);

    const r = await fetchTicketLigado('t1');

    expect(r?.numero).toBe(7);
    expect(r?.mensagens).toEqual([
      {
        id: 'm1',
        mensagem: 'Peritagem dia 13',
        tipo: 'nota_interna',
        created_at: 'y',
        autorNome: 'Chris',
      },
    ]);
  });

  it('devolve null quando o RLS esconde o ticket', async () => {
    const ticket = cadeia({ data: null, error: null }, 'maybeSingle');
    const msgs = cadeia({ data: [], error: null }, 'order');
    mockFrom.mockImplementation((t: string) => (t === 'assistencia_tickets' ? ticket : msgs));
    expect(await fetchTicketLigado('t1')).toBeNull();
  });
});

describe('ligarDanoATicket', () => {
  it('grava o ticket no dano, e null desliga', async () => {
    const chain = cadeia({ data: [{ id: 'd1' }], error: null }, 'select');
    mockFrom.mockReturnValue(chain);

    await ligarDanoATicket('d1', 't1');
    expect(chain.update.mock.calls[0][0]).toMatchObject({ ticket_id: 't1' });
    await ligarDanoATicket('d1', null);
    expect(chain.update.mock.calls[1][0]).toMatchObject({ ticket_id: null });
  });

  it('zero linhas actualizadas (RLS recusou) é erro', async () => {
    mockFrom.mockReturnValue(cadeia({ data: [], error: null }, 'select'));
    await expect(ligarDanoATicket('d1', 't1')).rejects.toThrow('Sem permissão');
  });

  it('propaga a recusa do trigger (ticket de outra viatura)', async () => {
    mockFrom.mockReturnValue(
      cadeia(
        {
          data: null,
          error: new Error('O ticket da Assistência tem de ser da mesma viatura do dano'),
        },
        'select'
      )
    );
    await expect(ligarDanoATicket('d1', 't9')).rejects.toThrow('mesma viatura');
  });
});
