import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  agruparPorCliente,
  montarFaturasPorLiquidar,
  type CobrancaEmitidaRow,
} from './useFaturasPorLiquidar';
import { linhasExcelPorLiquidar } from '@/lib/exportarFaturasPorLiquidar';

const row = (id: string, extra: Partial<CobrancaEmitidaRow> = {}): CobrancaEmitidaRow => ({
  id,
  descricao: null,
  valor_total: 100,
  emitida_em: '2026-10-10T10:00:00Z',
  destinatario_id: 'cli-a',
  destinatario_nome: 'Ana',
  contrato_id: 'ct',
  documento_externo_ref: `4 67/${id}`,
  ...extra,
});

describe('montarFaturasPorLiquidar', () => {
  it('pendente = total − pago − nota de crédito; liquidadas saem da lista', () => {
    const faturas = montarFaturasPorLiquidar(
      [row('1'), row('2'), row('3', { valor_total: 1371.45 })],
      new Map([['2', 100]]),
      new Map([['3', 777.15]])
    );
    expect(faturas.map((f) => [f.id, f.saldoPagar])).toEqual([
      ['1', 100],
      ['3', 594.3],
    ]);
  });

  it('nome com espaço no fim (vem assim da BD) não parte o agrupamento', () => {
    const [f] = montarFaturasPorLiquidar(
      [row('1', { destinatario_nome: 'Ana ' })],
      new Map(),
      new Map()
    );
    expect(f.destinatario_nome).toBe('Ana');
  });
});

describe('agruparPorCliente', () => {
  const faturas = montarFaturasPorLiquidar(
    [
      row('1', { destinatario_id: 'cli-z', destinatario_nome: 'Zé', valor_total: 10 }),
      row('2', { emitida_em: '2026-10-20T00:00:00Z', valor_total: 20.1 }),
      row('3', { emitida_em: '2026-10-01T00:00:00Z', valor_total: 30.2 }),
      row('4', { destinatario_id: 'cli-e', destinatario_nome: 'Érica', valor_total: 5 }),
    ],
    new Map(),
    new Map()
  );

  it('clientes por ordem alfabética (com acentos) e faturas da mais antiga para a mais recente', () => {
    const grupos = agruparPorCliente(faturas);
    expect(grupos.map((g) => g.clienteNome)).toEqual(['Ana', 'Érica', 'Zé']);
    expect(grupos[0].faturas.map((f) => f.id)).toEqual(['3', '2']);
    expect(grupos[0].totalPendente).toBe(50.3);
  });

  it('o Excel leva uma linha por fatura, o total de cada cliente e o total geral', () => {
    const linhas = linhasExcelPorLiquidar(agruparPorCliente(faturas));
    expect(linhas.map((l) => l.Cliente)).toEqual([
      'Ana',
      'Ana',
      'Total Ana',
      'Érica',
      'Total Érica',
      'Zé',
      'Total Zé',
      'Total',
    ]);
    expect(linhas.at(-1)?.Pendente).toBe(65.3);
  });
});
