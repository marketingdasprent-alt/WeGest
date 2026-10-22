import { describe, it, expect } from 'vitest';

import { deriveViaturaEstado, ESTADOS_EM_USO, statusAoGravarVenda } from './viaturas';

const fontes = (...f: string[]) => new Set(f);

describe('deriveViaturaEstado — carros da empresa', () => {
  it('com motorista está em TVDE (conta como em uso)', () => {
    expect(deriveViaturaEstado({ status: 'disponivel' }, fontes('tvde'))).toBe('em_tvde');
  });

  it('sem motorista nem ocupação está disponível', () => {
    expect(deriveViaturaEstado({ status: 'disponivel' }, undefined)).toBe('disponivel');
  });

  it('status legado em_uso continua ocupado', () => {
    expect(deriveViaturaEstado({ status: 'em_uso' }, undefined)).toBe('em_uso');
  });

  it('contrato e reserva mandam sobre o motorista', () => {
    expect(deriveViaturaEstado({ status: 'disponivel' }, fontes('tvde', 'contrato'))).toBe(
      'em_contrato'
    );
    expect(deriveViaturaEstado({ status: 'disponivel' }, fontes('reserva'))).toBe('em_reserva');
  });
});

describe('deriveViaturaEstado — carros slot (do próprio motorista)', () => {
  const slot = { status: 'disponivel', is_slot: true };

  it('com motorista está "em slot" — conta como em uso, nunca disponível', () => {
    expect(deriveViaturaEstado(slot, fontes('tvde'))).toBe('em_slot');
    expect(ESTADOS_EM_USO).toContain('em_slot');
  });

  it('sem motorista saiu com ele: conta como inativo', () => {
    expect(deriveViaturaEstado(slot, undefined)).toBe('inativo');
    expect(deriveViaturaEstado(slot, fontes())).toBe('inativo');
  });

  it('status legado em_uso não o torna ocupado sem motorista', () => {
    expect(deriveViaturaEstado({ ...slot, status: 'em_uso' }, undefined)).toBe('inativo');
  });

  it('manutenção, contrato e venda continuam a mandar', () => {
    expect(deriveViaturaEstado(slot, fontes('reparacao'))).toBe('manutencao');
    expect(deriveViaturaEstado(slot, fontes('contrato'))).toBe('em_contrato');
    expect(deriveViaturaEstado({ ...slot, is_vendida: true }, fontes('tvde'))).toBe('vendida');
  });
});

describe('statusAoGravarVenda — a ficha financeira só mexe no estado quando a venda muda', () => {
  it('venda inalterada não envia estado (nem para vendida nem para não vendida)', () => {
    expect(statusAoGravarVenda({ status: 'em_uso', is_vendida: false }, false)).toBeUndefined();
    expect(statusAoGravarVenda({ status: 'manutencao', is_vendida: null }, false)).toBeUndefined();
    expect(statusAoGravarVenda({ status: 'inativo', is_vendida: true }, true)).toBeUndefined();
  });

  it('passa a vendida: sai de frota como inativo (o estado manual), nunca "vendida"', () => {
    expect(statusAoGravarVenda({ status: 'disponivel', is_vendida: false }, true)).toBe('inativo');
    expect(statusAoGravarVenda({ status: 'em_uso', is_vendida: null }, true)).toBe('inativo');
  });

  it('deixa de ser vendida e estava fora de frota: volta a disponivel', () => {
    expect(statusAoGravarVenda({ status: 'inativo', is_vendida: true }, false)).toBe('disponivel');
    expect(statusAoGravarVenda({ status: 'vendida', is_vendida: true }, false)).toBe('disponivel');
  });

  it('deixa de ser vendida mas o estado é de operação: não mexe (é das triggers)', () => {
    expect(statusAoGravarVenda({ status: 'em_uso', is_vendida: true }, false)).toBeUndefined();
    expect(statusAoGravarVenda({ status: 'manutencao', is_vendida: true }, false)).toBeUndefined();
  });
});
