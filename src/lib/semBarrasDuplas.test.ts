import { describe, expect, it } from 'vitest';

import { caminhoSemBarrasDuplas } from './semBarrasDuplas';

describe('caminhoSemBarrasDuplas', () => {
  it('junta a barra dupla do link de confirmação', () => {
    expect(caminhoSemBarrasDuplas('//confirmar-email')).toBe('/confirmar-email');
  });

  it('junta barras repetidas a meio do caminho', () => {
    expect(caminhoSemBarrasDuplas('/motorista//registo')).toBe('/motorista/registo');
  });

  it('caminho limpo não muda', () => {
    expect(caminhoSemBarrasDuplas('/confirmar-email')).toBeNull();
    expect(caminhoSemBarrasDuplas('/')).toBeNull();
  });
});
