import { describe, expect, it } from 'vitest';

import { ehContaDeClienteDoSite, ehContaSemOrganizacao } from '@/lib/contaCliente';

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

describe('ehContaSemOrganizacao', () => {
  it('trava a conta sem metadata e sem organização (magic link com email desconhecido)', () => {
    expect(ehContaSemOrganizacao({ user_metadata: {} }, 0)).toBe(true);
  });

  it('trava o motorista que ficou sem organização', () => {
    expect(ehContaSemOrganizacao({ user_metadata: { tipo_utilizador: 'motorista' } }, 0)).toBe(
      true
    );
  });

  it('não trava quem tem pelo menos uma organização', () => {
    expect(ehContaSemOrganizacao({ user_metadata: {} }, 1)).toBe(false);
  });

  it('deixa a conta de cliente do site para o aviso próprio dela', () => {
    expect(ehContaSemOrganizacao(cliente, 0)).toBe(false);
  });

  it.each([[null], [undefined]])('não trava sem sessão (%#)', (user) => {
    expect(ehContaSemOrganizacao(user, 0)).toBe(false);
  });
});
