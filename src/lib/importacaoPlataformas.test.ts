import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/env', () => ({ SUPABASE_URL: 'https://exemplo.supabase.co' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: vi.fn() } } }));

import { pedidoParaFuncao, type PedidoImportacao } from './importacaoPlataformas';

const base: PedidoImportacao = {
  plataforma: 'uber',
  integracaoId: 'acores',
  texto: 'csv',
  nomeFicheiro: 'UBER AÇORES.csv',
  periodo: { inicio: '2026-09-21', fim: '2026-09-27' },
  origem: 'Importação automática',
};

describe('pedidoParaFuncao', () => {
  it('Uber: a semana vai no pedido e no prefixo do nome (é o sufixo das chaves)', () => {
    const { url, body } = pedidoParaFuncao(base);
    expect(url).toContain('/functions/v1/uber-webhook');
    expect(url).toContain('integracao_id=acores');
    expect(body).toMatchObject({
      integracao_id: 'acores',
      nome_original: '20260921-20260927-UBER AÇORES.csv',
      periodo_inicio: '2026-09-21',
      periodo_fim: '2026-09-27',
    });
  });

  it('Uber: nome que já traz a semana fica igual', () => {
    const { body } = pedidoParaFuncao({
      ...base,
      nomeFicheiro: '20260921-20260927-UBER AÇORES.csv',
    });
    expect(body.nome_original).toBe('20260921-20260927-UBER AÇORES.csv');
  });

  it('Bolt: período no formato que o importador grava', () => {
    const { body } = pedidoParaFuncao({ ...base, plataforma: 'bolt' });
    expect(body).toMatchObject({ periodo: '2026-09-21 a 2026-09-27', dados_csv_bolt: 'csv' });
  });

  it('Uber e Bolt sem semana: recusa em vez de adivinhar', () => {
    expect(() => pedidoParaFuncao({ ...base, periodo: null })).toThrow('Falta a semana');
  });

  it('combustível: só a conta e o ficheiro, a data vem de cada linha', () => {
    const { url, body } = pedidoParaFuncao({ ...base, plataforma: 'repsol', periodo: null });
    expect(url).toContain('/functions/v1/repsol-import-csv');
    expect(body).toEqual({ integracao_id: 'acores', combustivel_csv: 'csv' });
  });
});
