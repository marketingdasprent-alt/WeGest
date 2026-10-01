import { describe, it, expect } from 'vitest';

import { deriveViaturaEstado, ESTADOS_EM_USO } from './viaturas';

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
