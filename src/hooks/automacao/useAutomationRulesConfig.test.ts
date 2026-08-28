import { describe, it, expect } from 'vitest';
import { utilizadoresPorCargo } from './useAutomationRulesConfig';

/**
 * `profiles.nome` e `profiles.email` são NULLABLE na base de dados. Hoje não há
 * nenhum nulo entre os 95 utilizadores com cargo (verificado a 2026-08-26), mas
 * o modal de configuração faz `iniciais(u.nome)` → `nome.trim()`. Um perfil sem
 * nome dava ecrã branco no modal inteiro, não uma linha estranha.
 */
describe('utilizadoresPorCargo', () => {
  const cargos = { u1: 'cargo-a' };

  it('mapeia o perfil e cola-lhe o cargo', () => {
    const [u] = utilizadoresPorCargo([{ id: 'u1', nome: 'Ana Silva', email: 'ana@x.pt' }], cargos);

    expect(u).toEqual({ id: 'u1', nome: 'Ana Silva', email: 'ana@x.pt', cargo_id: 'cargo-a' });
  });

  it('perfil sem nome usa o email — nunca devolve null', () => {
    const [u] = utilizadoresPorCargo([{ id: 'u1', nome: null, email: 'ana@x.pt' }], cargos);

    expect(u.nome).toBe('ana@x.pt');
  });

  it('perfil sem nome nem email continua a ser uma string', () => {
    const [u] = utilizadoresPorCargo([{ id: 'u1', nome: null, email: null }], cargos);

    expect(typeof u.nome).toBe('string');
    expect(u.nome.length).toBeGreaterThan(0);
    expect(u.email).toBe('');
  });

  it('sem perfis devolve lista vazia', () => {
    expect(utilizadoresPorCargo([], cargos)).toEqual([]);
  });
});
