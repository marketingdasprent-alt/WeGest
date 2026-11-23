import { describe, expect, it } from 'vitest';

import { pedidoNaAbertura } from './pedidoNaAbertura';

const base = {
  regime: 'tvde',
  pretendido: 180,
  motivo: '',
  precoTarifa: 200,
  contratoId: 'c-1',
};

const NENHUM = { estado: 'nenhum' };

describe('pedidoNaAbertura', () => {
  it('TVDE com valor diferente da tarifa gera o pedido', () => {
    expect(pedidoNaAbertura(base)).toEqual({
      estado: 'pedir',
      pedido: {
        contratoId: 'c-1',
        tipo: 'preco_semana',
        valorAtual: 200,
        valorPedido: 180,
        motivo: 'Valor acordado na abertura do contrato',
      },
    });
  });

  it('acrescenta o motivo sem espaços à volta', () => {
    const r = pedidoNaAbertura({ ...base, motivo: '  Frota própria ' });
    expect(r.estado === 'pedir' && r.pedido.motivo).toBe(
      'Valor acordado na abertura do contrato: Frota própria'
    );
  });

  it('arredonda o valor pedido aos cêntimos', () => {
    const r = pedidoNaAbertura({ ...base, pretendido: 225.006, precoTarifa: 200 });
    expect(r.estado === 'pedir' && r.pedido.valorPedido).toBe(225.01);
  });

  it('igual à tarifa (em cêntimos) ou vazio: nada a pedir', () => {
    expect(pedidoNaAbertura({ ...base, pretendido: 200 })).toEqual(NENHUM);
    expect(pedidoNaAbertura({ ...base, pretendido: 200.004 })).toEqual(NENHUM);
    expect(pedidoNaAbertura({ ...base, pretendido: null })).toEqual(NENHUM);
    expect(pedidoNaAbertura({ ...base, pretendido: undefined })).toEqual(NENHUM);
  });

  it('tarifa sem preço (null ou 0): não pede e avisa', () => {
    expect(pedidoNaAbertura({ ...base, precoTarifa: null })).toEqual({
      estado: 'sem-preco-tarifa',
    });
    expect(pedidoNaAbertura({ ...base, precoTarifa: 0 })).toEqual({ estado: 'sem-preco-tarifa' });
  });

  it('sem valor pretendido a tarifa sem preço não avisa', () => {
    expect(pedidoNaAbertura({ ...base, pretendido: null, precoTarifa: null })).toEqual(NENHUM);
  });

  it('rent-a-car e slot nunca pedem', () => {
    expect(pedidoNaAbertura({ ...base, regime: 'rent_a_car' })).toEqual(NENHUM);
    expect(pedidoNaAbertura({ ...base, regime: 'slot' })).toEqual(NENHUM);
  });
});
