import { describe, expect, it } from 'vitest';

import { ehContaDeClienteDoSite } from '@/lib/contaCliente';

const cliente = { user_metadata: { tipo_utilizador: 'cliente' } };

describe('ehContaDeClienteDoSite', () => {
  it('reconhece a conta criada no registo Rent a Car do site, sem organização', () => {
    expect(ehContaDeClienteDoSite(cliente, 0)).toBe(true);
  });

  it('não trava quem se registou como cliente mas entrou por convite numa organização', () => {
    expect(ehContaDeClienteDoSite(cliente, 1)).toBe(false);
  });

  it.each([
    [{ user_metadata: { tipo_utilizador: 'motorista' } }],
    [{ user_metadata: { tipo_utilizador: 'colaborador' } }],
    [{ user_metadata: {} }],
    [null],
    [undefined],
  ])('não trava motoristas, colaboradores nem sessões vazias (%#)', (user) => {
    expect(ehContaDeClienteDoSite(user, 0)).toBe(false);
  });
});
