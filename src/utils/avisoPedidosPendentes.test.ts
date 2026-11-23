import { describe, it, expect, beforeEach, vi } from 'vitest';
import { avisoJaMostrado, marcarAvisoMostrado, resumirContagens } from './avisoPedidosPendentes';

describe('aviso de pedidos pendentes (uma vez por sessão)', () => {
  beforeEach(() => sessionStorage.clear());

  it('não está mostrado antes de marcar', () => {
    expect(avisoJaMostrado('u1')).toBe(false);
  });

  it('fica mostrado depois de marcar, só para esse utilizador', () => {
    marcarAvisoMostrado('u1');
    expect(avisoJaMostrado('u1')).toBe(true);
    expect(avisoJaMostrado('u2')).toBe(false);
  });

  it('com sessionStorage indisponível não rebenta', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const spy2 = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(avisoJaMostrado('u1')).toBe(false);
    expect(() => marcarAvisoMostrado('u1')).not.toThrow();
    spy.mockRestore();
    spy2.mockRestore();
  });
});

describe('resumirContagens', () => {
  it('soma e ignora tipos a zero', () => {
    const r = resumirContagens([
      ['kms', 2],
      ['franquia', 0],
      ['preco_semana', 1],
    ]);
    expect(r).toEqual({ total: 3, porTipo: { kms: 2, preco_semana: 1 } });
  });

  it('sem contagens dá total 0', () => {
    expect(resumirContagens([])).toEqual({ total: 0, porTipo: {} });
  });
});
