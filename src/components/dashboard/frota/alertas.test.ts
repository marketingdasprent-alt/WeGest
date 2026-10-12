import { describe, it, expect } from 'vitest';
import { extintoresAPrazoOperacionais } from './alertas';

const extintor = (id: string, motorista_viaturas: any[] = []) => ({
  id,
  matricula: `MAT-${id}`,
  extintor_validade: '2026-10-20',
  motorista_viaturas,
});

describe('extintoresAPrazoOperacionais', () => {
  it('deixa de fora viaturas inativas e vendidas', () => {
    const estados = new Map([
      ['a', 'disponivel'],
      ['b', 'inativo'],
      ['c', 'vendida'],
      ['d', 'em_slot'],
    ]);
    const lista = [extintor('a'), extintor('b'), extintor('c'), extintor('d')];

    const ids = extintoresAPrazoOperacionais(lista, estados).map((e) => e.id);

    expect(ids).toEqual(['a', 'd']);
  });

  it('mantém a viatura cujo estado não se conhece', () => {
    const ids = extintoresAPrazoOperacionais([extintor('x')], new Map()).map((e) => e.id);
    expect(ids).toEqual(['x']);
  });

  it('mostra o motorista da atribuição activa, ou Livre', () => {
    const estados = new Map([
      ['a', 'em_tvde'],
      ['b', 'disponivel'],
    ]);
    const lista = [
      extintor('a', [
        { status: 'terminado', data_fim: '2026-01-01', motoristas_ativos: { nome: 'Antigo' } },
        { status: 'ativo', data_fim: null, motoristas_ativos: { nome: 'Ana' } },
      ]),
      extintor('b'),
    ];

    const nomes = extintoresAPrazoOperacionais(lista, estados).map((e) => e.motorista_nome);

    expect(nomes).toEqual(['Ana', 'Livre']);
  });

  it('aceita lista vazia ou nula', () => {
    expect(extintoresAPrazoOperacionais(null, new Map())).toEqual([]);
  });
});
