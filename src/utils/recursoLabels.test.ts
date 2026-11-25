import { describe, expect, it } from 'vitest';
import { getRecursoLabel } from './recursoLabels';

describe('getRecursoLabel', () => {
  it('dá nome legível à permissão de enviar acesso à app', () => {
    expect(getRecursoLabel('motoristas_acesso_app')).toBe('Acesso dos motoristas à app');
  });

  it('recurso desconhecido mostra a chave', () => {
    expect(getRecursoLabel('recurso_inexistente')).toBe('recurso_inexistente');
  });
});
