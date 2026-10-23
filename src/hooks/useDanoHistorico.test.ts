import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

const mockPerfis = vi.fn();
vi.mock('@/hooks/usePerfisOrg', () => ({
  fetchPerfisOrg: (...args: unknown[]) => mockPerfis(...args),
}));

import {
  atualizarObservacoesDano,
  descreverPassoDano,
  fetchDanoHistorico,
  type DanoHistoricoEntrada,
} from './useDanoHistorico';

// Cadeia do query builder: cada método devolve a cadeia; o último resolve com `result`.
function cadeia(result: { data: unknown; error: unknown }, ultimo: string) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'update', 'order']) {
    chain[m] = vi.fn(() => (m === ultimo ? Promise.resolve(result) : chain));
  }
  return chain as Record<string, ReturnType<typeof vi.fn>>;
}

const base: DanoHistoricoEntrada = {
  id: 'h1',
  campo: 'estado',
  valorAnterior: null,
  valorNovo: 'existente',
  atorNome: null,
  criadoEm: '2026-10-23T10:00:00Z',
};

describe('descreverPassoDano', () => {
  it('primeira linha diz com que estado o dano foi registado', () => {
    expect(descreverPassoDano(base)).toBe('Registado como Existente');
  });

  it('mudança de estado mostra de → para, com os nomes do processo de sinistro', () => {
    expect(
      descreverPassoDano({ ...base, valorAnterior: 'aguarda_peritagem', valorNovo: 'condicional' })
    ).toBe('Aguarda Peritagem → Condicional');
  });

  it('edição de observações tem texto próprio', () => {
    expect(descreverPassoDano({ ...base, campo: 'observacoes', valorAnterior: 'a' })).toBe(
      'Observações alteradas'
    );
  });
});

describe('fetchDanoHistorico', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pede o histórico do dano por ordem cronológica e junta o nome de quem mudou', async () => {
    const chain = cadeia(
      {
        data: [
          {
            id: 'h1',
            campo: 'estado',
            valor_anterior: null,
            valor_novo: 'existente',
            ator_id: 'u1',
            criado_em: '2026-10-01T09:00:00Z',
          },
          {
            id: 'h2',
            campo: 'estado',
            valor_anterior: 'existente',
            valor_novo: 'aguarda_peritagem',
            ator_id: null,
            criado_em: '2026-10-02T09:00:00Z',
          },
        ],
        error: null,
      },
      'order'
    );
    mockFrom.mockReturnValue(chain);
    mockPerfis.mockResolvedValue([{ id: 'u1', nome: 'Carla' }]);

    const r = await fetchDanoHistorico('d1');

    expect(mockFrom).toHaveBeenCalledWith('viatura_dano_historico');
    expect(chain.eq).toHaveBeenCalledWith('dano_id', 'd1');
    expect(chain.order).toHaveBeenCalledWith('criado_em', { ascending: true });
    expect(mockPerfis).toHaveBeenCalledWith(['u1']);
    expect(r.map((e) => [e.id, e.atorNome])).toEqual([
      ['h1', 'Carla'],
      ['h2', null],
    ]);
  });

  it('propaga o erro do Supabase', async () => {
    mockFrom.mockReturnValue(cadeia({ data: null, error: new Error('boom') }, 'order'));
    await expect(fetchDanoHistorico('d1')).rejects.toThrow('boom');
  });
});

describe('atualizarObservacoesDano', () => {
  beforeEach(() => vi.clearAllMocks());

  it('grava o texto aparado e texto vazio como null', async () => {
    const chain = cadeia({ data: [{ id: 'd1' }], error: null }, 'select');
    mockFrom.mockReturnValue(chain);

    await atualizarObservacoesDano('d1', '  Peritagem a 13/10  ');
    expect(chain.update.mock.calls[0][0]).toMatchObject({ observacoes: 'Peritagem a 13/10' });

    await atualizarObservacoesDano('d1', '   ');
    expect(chain.update.mock.calls[1][0]).toMatchObject({ observacoes: null });
  });

  it('zero linhas actualizadas (RLS recusou) é erro, não sucesso silencioso', async () => {
    mockFrom.mockReturnValue(cadeia({ data: [], error: null }, 'select'));
    await expect(atualizarObservacoesDano('d1', 'x')).rejects.toThrow('Sem permissão');
  });
});
