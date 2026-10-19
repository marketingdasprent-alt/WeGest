import { describe, it, expect } from 'vitest';

import { ordenarNoUrl } from './ordenacaoNoUrl';

const url = (s: string) => new URLSearchParams(s);
const POR_MATRICULA = { sortField: 'matricula', sortDir: 'asc' as const };

describe('ordenarNoUrl', () => {
  it('outra coluna: muda a coluna e começa ascendente (antes ficava na matrícula)', () => {
    expect(
      ordenarNoUrl(url('status=disponivel'), 'ano', POR_MATRICULA, 'matricula').toString()
    ).toBe('status=disponivel&sort=ano');
  });

  it('a partir de uma coluna descendente, outra coluna volta a ascendente', () => {
    const r = ordenarNoUrl(
      url('sort=km_atual&dir=desc'),
      'marca',
      {
        sortField: 'km_atual',
        sortDir: 'desc',
      },
      'matricula'
    );
    expect(r.toString()).toBe('sort=marca');
  });

  it('a mesma coluna alterna a direcção', () => {
    const desc = ordenarNoUrl(
      url('sort=ano'),
      'ano',
      { sortField: 'ano', sortDir: 'asc' },
      'matricula'
    );
    expect(desc.toString()).toBe('sort=ano&dir=desc');
    const asc = ordenarNoUrl(desc, 'ano', { sortField: 'ano', sortDir: 'desc' }, 'matricula');
    expect(asc.toString()).toBe('sort=ano');
  });

  it('a coluna por omissão não fica no endereço', () => {
    const r = ordenarNoUrl(
      url('sort=ano&dir=desc'),
      'matricula',
      {
        sortField: 'ano',
        sortDir: 'desc',
      },
      'matricula'
    );
    expect(r.toString()).toBe('');
  });
});
