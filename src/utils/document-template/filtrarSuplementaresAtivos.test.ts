import { describe, it, expect } from 'vitest';
import { filtrarSuplementaresAtivos } from './filtrarSuplementaresAtivos';

const base = [
  { id: '1', ativo: true, empresaIds: ['e1', 'e2'] },
  { id: '2', ativo: false, empresaIds: ['e1'] },
  { id: '3', ativo: true, empresaIds: ['e2'] },
];

describe('filtrarSuplementaresAtivos', () => {
  it('devolve só os ativos associados à empresa pedida', () => {
    expect(filtrarSuplementaresAtivos(base, 'e1').map((d) => d.id)).toEqual(['1']);
  });

  it('devolve vazio quando nenhum está associado', () => {
    expect(filtrarSuplementaresAtivos(base, 'e9')).toEqual([]);
  });

  it('exclui inativos mesmo que associados à empresa', () => {
    expect(filtrarSuplementaresAtivos(base, 'e1').some((d) => d.id === '2')).toBe(false);
  });
});
